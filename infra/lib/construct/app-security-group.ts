import { Construct } from 'constructs';
import { IVpc, Peer, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { Tags } from 'aws-cdk-lib';

export interface AppSecurityGroupProps {
  readonly namePrefix: string;
  readonly vpc: IVpc;
}

export class AppSecurityGroup extends Construct {
  public readonly apiEcsSecurityGroup: SecurityGroup;
  public readonly vpcEndpointSecurityGroup: SecurityGroup;

  private readonly namePrefix: string;

  constructor(scope: Construct, id: string, props: AppSecurityGroupProps) {
    super(scope, id);

    const { namePrefix, vpc } = props;
    this.namePrefix = namePrefix;

    // API ECS用セキュリティグループを作成する
    const apiEcsSecurityGroup = this.createApiEcsSecurityGroup(vpc);

    // VPCエンドポイント用セキュリティグループを作成する
    const vpcEndpointSecurityGroup = this.createVpcEndpointSecurityGroup(vpc, apiEcsSecurityGroup);

    this.apiEcsSecurityGroup = apiEcsSecurityGroup;
    this.vpcEndpointSecurityGroup = vpcEndpointSecurityGroup;
  }

  /**
   * API ECS用セキュリティグループを作成する
   *
   * @param vpc
   * @private
   */
  private createApiEcsSecurityGroup(vpc: IVpc): SecurityGroup {
    const securityGroup = this.createSecurityGroup(
      'ApiEcs',
      'api-ecs-sg',
      'API ECS Security Group',
      vpc,
    );

    // TODO 検討中
    securityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(80), 'from anywhere');

    return securityGroup;
  }

  /**
   * VPCエンドポイント用セキュリティグループを作成する。
   *
   * @param vpc
   * @param apiEcsSecurityGroup
   * @private
   */
  private createVpcEndpointSecurityGroup(
    vpc: IVpc,
    apiEcsSecurityGroup: SecurityGroup,
  ): SecurityGroup {
    const securityGroup = this.createSecurityGroup(
      'VpcEndpoint',
      'vpc-endpoint-sg',
      'VPC Endpoint Security Group',
      vpc,
    );

    securityGroup.addIngressRule(apiEcsSecurityGroup, Port.tcp(443), 'from API ECS');

    return securityGroup;
  }

  private createSecurityGroup(
    id: string,
    name: string,
    description: string,
    vpc: IVpc,
  ): SecurityGroup {
    const securityGroupName = `${this.namePrefix}-${name}`;
    const securityGroup = new SecurityGroup(this, id, {
      securityGroupName: securityGroupName,
      description: description,
      vpc: vpc,
    });
    Tags.of(securityGroup).add('Name', securityGroupName);

    return securityGroup;
  }
}
