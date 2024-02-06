import { Construct } from 'constructs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { RemovalPolicy } from 'aws-cdk-lib';

export function createLogGroup(scope: Construct, idPrefix: string, logGroupName: string): LogGroup {
  return new LogGroup(scope, `${idPrefix}LogGroup`, {
    logGroupName: logGroupName,
    retention: RetentionDays.ONE_YEAR,
    removalPolicy: RemovalPolicy.DESTROY,
  });
}
