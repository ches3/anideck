import type { AppError } from "../errors/index.ts";

export interface AppErrorLogMeta {
  type: "api.app_error";
  errorCode: AppError["errorCode"];
  message: AppError["message"];
  details: AppError["details"] | null;
}

export interface UnexpectedErrorLogMeta {
  type: "api.unexpected_error";
  errorName: string;
  errorMessage: string;
}

export interface ApiContextVariables {
  errorMeta?: AppErrorLogMeta | UnexpectedErrorLogMeta;
}

export type ApiEnv = {
  Variables: ApiContextVariables;
};
