import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Network } from './construct/network';
import { Auth } from './construct/auth';
import { ApiEcs } from './construct/api-ecs';
import { AppSecurityGroup } from './construct/app-security-group';
import { EnvValues } from './type/env-values';

export interface InfraStackProps extends StackProps {
  readonly projectName: string;
  readonly envValues: EnvValues;
  readonly namePrefix: string;
}

export class InfraStack extends Stack {
  constructor(scope: Construct, id: string, props: InfraStackProps) {
    super(scope, id, props);

    const { namePrefix, envValues } = props;

    const network = new Network(this, 'network', {
      namePrefix,
    });

    const securityGroup = new AppSecurityGroup(this, 'security-group', {
      namePrefix,
      vpc: network.vpc,
    });

    const auth = new Auth(this, 'auth', {
      namePrefix,
    });

    const apiEcs = new ApiEcs(this, 'api-ecs', {
      namePrefix,
      vpc: network.vpc,
      apiEcsSecurityGroup: securityGroup.apiEcsSecurityGroup,
      ecsSettings: envValues.apiEcsSettings,
    });

    this.output(auth);
  }

  private output(auth: Auth) {
    // Cognito関連の情報を出力
    new CfnOutput(this, 'userPoolId', {
      value: auth.userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new CfnOutput(this, 'userPoolClientId', {
      value: auth.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });

    new CfnOutput(this, 'identityPoolId', {
      value: auth.idPool.identityPoolId,
      description: 'Cognito Identity Pool ID',
    });
  }
}
