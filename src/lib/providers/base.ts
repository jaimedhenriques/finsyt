export type DataProviderStatus = "healthy" | "unconfigured";

export interface DataProvider {
  id: string;
  displayName: string;
  configured: boolean;
  health(): Promise<DataProviderStatus>;
}
