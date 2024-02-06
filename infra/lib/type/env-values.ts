export interface EnvValues {
  readonly envName: string;
  readonly apiEcsSettings: ApiEcsSettings;
}

export interface ApiEcsSettings {
  readonly cpu: number;
  readonly memoryLimitMiB: number;
  readonly desiredCount: number;
  readonly minCapacity: number;
  readonly maxCapacity: number;
}
