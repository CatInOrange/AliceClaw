interface PetOverlayBounds {
  workArea: { x: number; y: number; width: number; height: number };
  virtualBounds: { x: number; y: number; width: number; height: number };
}

export function getPetOverlayCenter(bounds: PetOverlayBounds): { x: number; y: number };
