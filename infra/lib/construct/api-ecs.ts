import { Construct } from 'constructs';
import { IVpc, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import {
  Cluster,
  ContainerImage,
  CpuArchitecture,
  DeploymentControllerType,
  FargateService,
  FargateTaskDefinition,
  LogDrivers,
  OperatingSystemFamily,
} from 'aws-cdk-lib/aws-ecs';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { DockerImageName, ECRDeployment } from 'cdk-ecr-deployment';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { createLogGroup } from '../utils';
import { ApiEcsSettings } from '../type/env-values';

interface ApiEcsProps {
  readonly namePrefix: string;
  readonly vpc: IVpc;
  readonly apiEcsSecurityGroup: SecurityGroup;
  readonly ecsSettings: ApiEcsSettings;
}

export class ApiEcs extends Construct {
  public readonly cluster: Cluster;
  public readonly service: FargateService;
  public readonly repository: Repository;

  private readonly namePrefix: string;

  constructor(scope: Construct, id: string, props: ApiEcsProps) {
    super(scope, id);

    const { namePrefix, vpc, apiEcsSecurityGroup, ecsSettings } = props;
    this.namePrefix = namePrefix;

    // ECSタスク実行用のロールを作成する
    const taskExecutionRole = this.createTaskExecutionRole();
    // ECSタスク用のロールを作成する
    const taskRole = this.createTaskRole();

    // ECRリポジトリを作成する
    const repository = this.createRepository();
    // ECRイメージをデプロイする
    this.deployEcrImage(repository);

    // ECSクラスターを作成する
    const cluster = this.createEcsCluster(vpc);
    // ECSタスク定義を作成する
    const taskDef = this.createTaskDefinition(taskExecutionRole, taskRole, ecsSettings);
    // ECSタスク用のロググループを作成する
    const logGroup = createLogGroup(this, 'ApiEcs', '/ecs/api-ecs-log');
    // ECSタスク定義にフロント用コンテナを追加する
    this.addContainer(taskDef, repository, logGroup);
    // ECSサービスを作成する
    this.service = this.createEcsService(cluster, taskDef, apiEcsSecurityGroup, vpc, ecsSettings);

    this.cluster = cluster;
    this.repository = repository;
  }

  private createTaskExecutionRole(): Role {
    return new Role(this, 'TaskExecutionRole', {
      roleName: `${this.namePrefix}-api-ecs-task-execution-role`,
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        {
          managedPolicyArn: 'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy',
        },
      ],
    });
  }

  private createTaskRole(): Role {
    return new Role(this, 'TaskRole', {
      roleName: `${this.namePrefix}-api-ecs-task-role`,
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
  }

  private createRepository(): Repository {
    return new Repository(this, 'Ecr', {
      repositoryName: `${this.namePrefix}-api-ecs-ecr`,
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      imageScanOnPush: true,
    });
  }

  private deployEcrImage(repository: Repository): void {
    // ダミーとなるイメージをデプロイする
    // 正しいAPI資材のデプロイは、APIリポジトリのCI/CDで行う
    // 理由は以下
    // イメージが無いとCDKのECSのデプロイがタイムアウトになり失敗になってしまうため
    // この時点では、ダミーのイメージのデプロイとする
    new ECRDeployment(this, 'EcrDummyDeploy', {
      // src: new DockerImageName('public.ecr.aws/docker/library/nginx:1.25.3-perl'),
      src: new DockerImageName('nginx:latest'),
      dest: new DockerImageName(`${repository.repositoryUri}:latest`),
    });
  }

  private createEcsCluster(vpc: IVpc): Cluster {
    return new Cluster(this, 'Cluster', {
      clusterName: `${this.namePrefix}-api-ecs-cluster`,
      vpc,
      enableFargateCapacityProviders: true,
      containerInsights: true,
    });
  }

  private createTaskDefinition(
    taskExecutionRole: Role,
    batchEcsTaskRole: Role,
    ecsSettings: ApiEcsSettings,
  ): FargateTaskDefinition {
    return new FargateTaskDefinition(this, 'TaskDefinition', {
      family: `${this.namePrefix}-api-ecs-task-def`,
      executionRole: taskExecutionRole,
      taskRole: batchEcsTaskRole,
      cpu: ecsSettings.cpu,
      memoryLimitMiB: ecsSettings.memoryLimitMiB,
      runtimePlatform: {
        cpuArchitecture: CpuArchitecture.X86_64,
        operatingSystemFamily: OperatingSystemFamily.LINUX,
      },
    });
  }

  private addContainer(taskDef: FargateTaskDefinition, repository: Repository, logGroup: LogGroup) {
    taskDef.addContainer('Container', {
      containerName: 'api-ecs-container',
      image: ContainerImage.fromEcrRepository(repository, 'latest'),
      logging: LogDrivers.awsLogs({
        streamPrefix: 'ecs',
        logGroup: logGroup,
      }),
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost/ || exit 1'],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        retries: 3,
        startPeriod: Duration.seconds(60),
      },
    });
  }

  private createEcsService(
    cluster: Cluster,
    taskDef: FargateTaskDefinition,
    apiEcsSecurityGroup: SecurityGroup,
    vpc: IVpc,
    ecsSettings: ApiEcsSettings,
  ): FargateService {
    const service = new FargateService(this, 'Service', {
      serviceName: `${this.namePrefix}-api-ecs-service`,
      cluster,
      taskDefinition: taskDef,
      desiredCount: ecsSettings.desiredCount,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      assignPublicIp: true, // TODO falseにする
      vpcSubnets: {
        subnets: vpc.publicSubnets, // TODO privateSubnetsにする
      },
      deploymentController: {
        type: DeploymentControllerType.ECS,
      },
      circuitBreaker: {
        rollback: true,
      },
      securityGroups: [apiEcsSecurityGroup],
    });

    const scalableTarget = service.autoScaleTaskCount({
      minCapacity: ecsSettings.minCapacity,
      maxCapacity: ecsSettings.maxCapacity,
    });
    scalableTarget.scaleOnCpuUtilization('CpuScaling', {
      policyName: 'CpuScalingPolicy',
      targetUtilizationPercent: 70,
      scaleInCooldown: Duration.seconds(60),
      scaleOutCooldown: Duration.seconds(60),
    });

    return service;
  }
}
