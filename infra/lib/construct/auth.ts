import { Construct } from 'constructs';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { UserPool, type UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import {
  IdentityPool,
  UserPoolAuthenticationProvider,
} from '@aws-cdk/aws-cognito-identitypool-alpha';
import { type CfnRole } from 'aws-cdk-lib/aws-iam';

export interface AuthProps {
  readonly namePrefix: string;
}

export class Auth extends Construct {
  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;
  public readonly idPool: IdentityPool;

  private readonly namePrefix: string;

  constructor(scope: Construct, id: string, props: AuthProps) {
    super(scope, id);

    const { namePrefix } = props;
    this.namePrefix = namePrefix;

    // ユーザープールを作成する
    const userPool = this.createUserPool();

    // ユーザークライアントを作成する
    const userPoolClient = this.createUserPoolClient(userPool);

    // IDプールを作成する
    const idPool = this.createIdentityPool(userPool, userPoolClient);

    // IDプール用のロール名を変更する
    this.renameIdentityPoolRoleName(idPool);

    this.userPool = userPool;
    this.userPoolClient = userPoolClient;
    this.idPool = idPool;
  }

  private createUserPool(): UserPool {
    return new UserPool(this, 'UserPool', {
      userPoolName: `${this.namePrefix}-user-pool`,
      deletionProtection: false,
      removalPolicy: RemovalPolicy.DESTROY,
      selfSignUpEnabled: true,
      signInAliases: {
        username: false,
        email: true,
      },
    });
  }

  private createUserPoolClient(userPool: UserPool): UserPoolClient {
    return userPool.addClient('UserPoolClient', {
      userPoolClientName: `${this.namePrefix}-client`,
      idTokenValidity: Duration.days(1),
    });
  }

  private createIdentityPool(userPool: UserPool, userPoolClient: UserPoolClient): IdentityPool {
    return new IdentityPool(this, 'IdentityPool', {
      identityPoolName: `${this.namePrefix}-id-pool`,
      authenticationProviders: {
        userPools: [
          new UserPoolAuthenticationProvider({
            userPool,
            userPoolClient,
          }),
        ],
      },
    });
  }

  private renameIdentityPoolRoleName(idPool: IdentityPool): void {
    // 認証済みロールのロール名を変更する
    const cfnAuthenticatedRole = idPool.authenticatedRole.node.defaultChild as CfnRole;
    cfnAuthenticatedRole.addPropertyOverride(
      'RoleName',
      `${this.namePrefix}-id-pool-authenticated-role`,
    );

    // 未認証ロールのロール名を変更する
    const cfnUnauthenticatedRole = idPool.unauthenticatedRole.node.defaultChild as CfnRole;
    cfnUnauthenticatedRole.addPropertyOverride(
      'RoleName',
      `${this.namePrefix}-id-pool-unauthenticated-role`,
    );
  }
}
