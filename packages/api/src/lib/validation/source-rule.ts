import {
  type InferOutput,
  check,
  minValue,
  nonEmpty,
  number,
  object,
  optional,
  partial,
  pipe,
  string,
} from "valibot";

function isValidRegExpPattern(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

export const sourceRulePatternSchema = pipe(
  string("パターンを入力してください"),
  nonEmpty("パターンを入力してください"),
  check((pattern) => isValidRegExpPattern(pattern), "正規表現として無効なパターンです"),
);

const sortOrderSchema = pipe(
  number("sortOrder は数値で入力してください"),
  check((value) => Number.isInteger(value), "sortOrder は整数で入力してください"),
  minValue(0, "sortOrder は 0 以上の整数で入力してください"),
);

export const sourceRuleCreateSchema = object({
  pattern: sourceRulePatternSchema,
  sortOrder: optional(sortOrderSchema),
});

export const sourceRuleUpdateSchema = pipe(
  partial(sourceRuleCreateSchema),
  check(
    (input) => input.pattern !== undefined || input.sortOrder !== undefined,
    "更新する項目を1つ以上指定してください",
  ),
);

export type SourceRuleCreateInput = InferOutput<typeof sourceRuleCreateSchema>;
export type SourceRuleUpdateInput = InferOutput<typeof sourceRuleUpdateSchema>;
