import { typeLabel, type LayerType } from "./layers";

export function typeLayerLabel(t: LayerType): string {
  return typeLabel(t).toUpperCase();
}
