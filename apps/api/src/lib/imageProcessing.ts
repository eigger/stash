import sharp from "sharp";

const MAX_DIMENSION = 1600;

// 업로드된 이미지를 웹에 적합한 크기의 JPEG로 리사이즈/변환한다.
export async function processImageForStorage(
  buffer: Buffer,
): Promise<{ buffer: Buffer; mimeType: string; ext: string }> {
  const resized = await sharp(buffer)
    .rotate()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  return { buffer: resized, mimeType: "image/jpeg", ext: ".jpg" };
}
