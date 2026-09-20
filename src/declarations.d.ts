/// <reference types="next" />
/// <reference types="next/image-types/global" />

declare module "*.png" {
  const content: { src: string; height: number; width: number; blurDataURL?: string } | string;
  export default content;
}

declare module "*.svg" {
  const content: string;
  export default content;
}
