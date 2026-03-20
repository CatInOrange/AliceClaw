interface PetAnchor {
  x: number;
  y: number;
}

interface DragArgs {
  startAnchor: PetAnchor;
  dragStart: { x: number; y: number };
  pointer: { x: number; y: number };
}

interface PetAnchorUpdateArgs {
  currentAnchor: PetAnchor;
  nextAnchor: PetAnchor;
  isLocked: boolean;
}

interface ShouldUpdatePetAnchorArgs {
  currentAnchor: PetAnchor | null | undefined;
  nextAnchor: PetAnchor | null | undefined;
}

interface ResolvePetShellHoverStateArgs {
  petSurface: string;
  isHovering: boolean;
}

export function resolvePetShellHoverState(args: ResolvePetShellHoverStateArgs): boolean;
export function resolvePetAnchorUpdate(args: PetAnchorUpdateArgs): PetAnchor;
export function shouldUpdatePetAnchor(args: ShouldUpdatePetAnchorArgs): boolean;
export function getDraggedPetAnchor(args: DragArgs): PetAnchor;
