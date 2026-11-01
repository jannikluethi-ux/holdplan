import { nanoid } from "nanoid";

export function newId(prefix = "id"): string {
  return `${prefix}_${nanoid(10)}`;
}
