import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";

function required(name: "R2_ACCOUNT_ID" | "R2_ACCESS_KEY_ID" | "R2_SECRET_ACCESS_KEY" | "R2_BUCKET_NAME" | "R2_ENDPOINT") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

let client: S3Client | undefined;

function r2Client() {
  client ??= new S3Client({
    region: "auto",
    endpoint: required("R2_ENDPOINT"),
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    },
  });
  return client;
}

function bucket() {
  return required("R2_BUCKET_NAME");
}

export const r2 = {
  async put(key: string, body: BodyInit, contentType: string) {
    await r2Client().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body as never, ContentType: contentType }));
  },
  get(key: string) {
    return r2Client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  },
  head(key: string) {
    return r2Client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
  },
  async delete(key: string) {
    await r2Client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  },
  createMultipartUpload(key: string, contentType: string) {
    return r2Client().send(new CreateMultipartUploadCommand({ Bucket: bucket(), Key: key, ContentType: contentType }));
  },
  uploadPart(key: string, uploadId: string, partNumber: number, body: Uint8Array) {
    return r2Client().send(new UploadPartCommand({ Bucket: bucket(), Key: key, UploadId: uploadId, PartNumber: partNumber, Body: body }));
  },
  completeMultipartUpload(key: string, uploadId: string, parts: Array<{ partNumber: number; etag: string }>) {
    return r2Client().send(new CompleteMultipartUploadCommand({
      Bucket: bucket(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts.map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })) },
    }));
  },
  abortMultipartUpload(key: string, uploadId: string) {
    return r2Client().send(new AbortMultipartUploadCommand({ Bucket: bucket(), Key: key, UploadId: uploadId }));
  },
};
