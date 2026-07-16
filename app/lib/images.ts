import type { FileUIPart } from "ai";

export const IMAGE_LIMITS = {
  maxCount: 4,
  maxBytes: 5 * 1024 * 1024,
  accept: "image/*",
} as const;

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;
const DOWNSCALE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

function readAsDataURL(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = src;
  });
}

async function downscale(file: File): Promise<string> {
  const dataUrl = await readAsDataURL(file);
  const img = await loadImageEl(dataUrl);
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  if (longest <= MAX_EDGE) return dataUrl;

  const scale = MAX_EDGE / longest;
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

export async function fileToImagePart(file: File): Promise<FileUIPart> {
  let url: string;
  if (DOWNSCALE_TYPES.has(file.type)) {
    try {
      url = await downscale(file);
    } catch {
      url = await readAsDataURL(file);
    }
  } else {
    url = await readAsDataURL(file);
  }
  return {
    type: "file",
    mediaType: file.type || "image/png",
    filename: file.name || undefined,
    url,
  };
}

export function extractImageFiles(
  source: File[] | FileList | DataTransferItemList | undefined | null,
): File[] {
  if (!source) return [];
  const files =
    source instanceof DataTransferItemList
      ? Array.from(source)
          .map((item) => item.getAsFile())
          .filter((f): f is File => f != null)
      : Array.from(source);
  return files.filter(isImageFile);
}

export interface AddResult {
  added: FileUIPart[];
  rejected: { file: File; reason: string }[];
}

export async function buildImageParts(
  files: File[],
  remainingSlots: number,
): Promise<AddResult> {
  const rejected: { file: File; reason: string }[] = [];
  const accepted: File[] = [];

  for (const file of files) {
    if (accepted.length >= remainingSlots) {
      rejected.push({ file, reason: `Max ${IMAGE_LIMITS.maxCount} images per message` });
      continue;
    }
    if (file.size > IMAGE_LIMITS.maxBytes) {
      rejected.push({
        file,
        reason: `Larger than ${Math.round(IMAGE_LIMITS.maxBytes / 1024 / 1024)} MB`,
      });
      continue;
    }
    accepted.push(file);
  }

  const added = await Promise.all(accepted.map((f) => fileToImagePart(f)));
  return { added, rejected };
}
