import { type InferOutput, maxLength, minLength, nonEmpty, object, pipe, string } from "valibot";

export const sourceRootPathSchema = pipe(
  string("パスを入力してください"),
  nonEmpty("パスを入力してください"),
  minLength(1, "パスを入力してください"),
  maxLength(4096, "パスは4096文字以下で入力してください"),
);

export const sourceRootCreateSchema = object({
  path: sourceRootPathSchema,
});

export const sourceRootUpdateSchema = object({
  path: sourceRootPathSchema,
});

export type SourceRootCreateInput = InferOutput<typeof sourceRootCreateSchema>;
export type SourceRootUpdateInput = InferOutput<typeof sourceRootUpdateSchema>;
