export function getAnnictToken(): string | undefined {
  const token = process.env.ANNICT_TOKEN;
  return token !== undefined && token.length > 0 ? token : undefined;
}
