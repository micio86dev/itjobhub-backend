import { mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
// pdf-parse v2 uses a class-based API: new PDFParse({ buffer }).getText()
import { PDFParse } from 'pdf-parse';
import { config } from '../../config';
import { prisma } from '../../config/database';
import { extractProfileFromText, type ExtractedProfile } from '../groq/groq.service';
import logger from '../../utils/logger';

export interface CvRecord {
  id: string;
  language: string;
  filename: string;
  url: string;
  size: number;
  uploadedAt: string;
}

const cvDir = (userId: string) => join(config.upload.uploadPath, 'cvs', userId);
const cvServedUrl = (userId: string, storedName: string) => `/uploads/cvs/${userId}/${storedName}`;
const cvDiskPath = (userId: string, storedName: string) => join(config.upload.uploadPath, 'cvs', userId, storedName);

const toCvRecord = (cv: { id: string; language: string; filename: string; url: string; size: number; uploaded_at: Date }): CvRecord => ({
  id: cv.id,
  language: cv.language,
  filename: cv.filename,
  url: cv.url,
  size: cv.size,
  uploadedAt: cv.uploaded_at.toISOString()
});

export const uploadCV = async (userId: string, file: File, language: string): Promise<CvRecord> => {
  if (file.type !== 'application/pdf') {
    throw Object.assign(new Error('Only PDF files are supported'), { code: 'INVALID_FILE_TYPE' });
  }
  if (file.size > config.upload.maxFileSize) {
    throw Object.assign(new Error(`File too large (max ${config.upload.maxFileSize / 1024 / 1024}MB)`), { code: 'FILE_TOO_LARGE' });
  }

  await mkdir(cvDir(userId), { recursive: true });

  const storedName = `${randomUUID()}.pdf`;
  const diskPath = cvDiskPath(userId, storedName);
  const buffer = await file.arrayBuffer();
  await Bun.write(diskPath, buffer);

  const url = cvServedUrl(userId, storedName);

  // Find and delete previous CV for this language (upsert by language)
  const existing = await prisma.userCV.findFirst({ where: { user_id: userId, language } });
  if (existing) {
    try {
      const oldStoredName = existing.url.split('/').pop()!;
      await unlink(cvDiskPath(userId, oldStoredName));
    } catch {
      // file may have already been removed
    }
    await prisma.userCV.delete({ where: { id: existing.id } });
  }

  const cv = await prisma.userCV.create({
    data: { user_id: userId, language, filename: file.name, url, size: file.size }
  });

  // Keep cv_url in sync for backward compat (first CV)
  const allCvs = await prisma.userCV.findMany({ where: { user_id: userId }, orderBy: { uploaded_at: 'asc' }, take: 1 });
  await prisma.userProfile.upsert({
    where: { user_id: userId },
    update: { cv_url: allCvs[0]?.url },
    create: { user_id: userId, cv_url: allCvs[0]?.url, languages: [], skills: [], workModes: [] }
  });

  return toCvRecord(cv);
};

export const getUserCVs = async (userId: string): Promise<CvRecord[]> => {
  const cvs = await prisma.userCV.findMany({
    where: { user_id: userId },
    orderBy: { uploaded_at: 'desc' }
  });
  return cvs.map(toCvRecord);
};

export const deleteCV = async (userId: string, cvId: string): Promise<void> => {
  const cv = await prisma.userCV.findFirst({ where: { id: cvId, user_id: userId } });
  if (!cv) throw Object.assign(new Error('CV not found'), { code: 'NOT_FOUND' });

  const storedName = cv.url.split('/').pop()!;
  try {
    await unlink(cvDiskPath(userId, storedName));
  } catch {
    // ignore missing file
  }

  await prisma.userCV.delete({ where: { id: cvId } });

  // Update cv_url backward compat
  const remaining = await prisma.userCV.findMany({ where: { user_id: userId }, orderBy: { uploaded_at: 'asc' }, take: 1 });
  await prisma.userProfile.updateMany({
    where: { user_id: userId },
    data: { cv_url: remaining[0]?.url ?? null }
  });
};

export const extractTextFromPDF = async (diskPath: string): Promise<string> => {
  const buffer = await Bun.file(diskPath).arrayBuffer();
  const parser = new PDFParse({ data: Buffer.from(buffer) });
  const result = await parser.getText();
  await parser.destroy();
  if (result.text.trim().length < 10) {
    throw Object.assign(new Error('PDF appears to be image-based and cannot be parsed as text'), { code: 'IMAGE_BASED_PDF' });
  }
  return result.text;
};

export const parseCVWithGroq = async (userId: string, cvId: string): Promise<ExtractedProfile> => {
  const cv = await prisma.userCV.findFirst({ where: { id: cvId, user_id: userId } });
  if (!cv) throw Object.assign(new Error('CV not found'), { code: 'NOT_FOUND' });

  const storedName = cv.url.split('/').pop()!;
  const diskPath = cvDiskPath(userId, storedName);

  let text: string;
  try {
    text = await extractTextFromPDF(diskPath);
  } catch (err) {
    if ((err as { code?: string }).code === 'IMAGE_BASED_PDF') throw err;
    logger.error({ err }, 'PDF text extraction failed');
    throw err;
  }

  return extractProfileFromText(text);
};
