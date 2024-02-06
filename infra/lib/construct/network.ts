import { Construct } from 'constructs';
import {
  CfnInternetGateway,
  CfnRouteTable,
  IpAddresses,
  IVpc,
  SubnetType,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
import { Tags } from 'aws-cdk-lib';

export interface NetworkProps {
  readonly namePrefix: string;
}

export class Network extends Construct {
  public readonly vpc: IVpc;

  constructor(scope: Construct, id: string, props: NetworkProps) {
    super(scope, id);

    const { namePrefix } = props;

    const vpc = new Vpc(this, 'vpc', {
      vpcName: `${namePrefix}-vpc`,
      ipAddresses: IpAddresses.cidr('172.16.0.0/16'),
      natGateways: 0,
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
    });

    vpc.publicSubnets.forEach((subnet, index) => {
      const no = index + 1;
      Tags.of(subnet).add('Name', `${namePrefix}-public-subnet-${no}`);

      const rtb = subnet.node.findChild('RouteTable') as CfnRouteTable;
      Tags.of(rtb).add('Name', `${namePrefix}-public-rtb-${no}`);
    });
    vpc.privateSubnets.forEach((subnet, index) => {
      const no = index + 1;
      Tags.of(subnet).add('Name', `${namePrefix}-private-subnet-${no}`);

      const rtb = subnet.node.findChild('RouteTable') as CfnRouteTable;
      Tags.of(rtb).add('Name', `${namePrefix}-private-rtb-${no}`);
    });

    const igw = vpc.node.findChild('IGW') as CfnInternetGateway;
    Tags.of(igw).add('Name', `${namePrefix}-igw`);

    this.vpc = vpc;
  }
}
