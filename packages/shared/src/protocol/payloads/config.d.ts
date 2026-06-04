export interface ConfigGetRequest {
  key: string;
}
export interface ConfigGetResponse {
  key: string;
  value: string | null;
}
export interface ConfigSetRequest {
  key: string;
  value: string;
}
export interface ConfigSetResponse {
  ok: boolean;
}
