import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { MAX_IMAGE_BYTES, MAX_IMAGES_PER_ENTITY } from '../../common/enums';

export interface StoredImage {
  _id?: any;
  url: string;
  filename: string;
}

/**
 * GEN-08 shared media-upload rule:
 * JPG or PNG only (checked by MIME type AND file signature), <= 5 MB each,
 * <= 5 images per post/activity/hotel, 1 logo per airline. Stored on the server, served by URL.
 */
@Injectable()
export class UploadsService {
  constructor(private config: ConfigService) {}

  get dir() {
    return resolve(this.config.get<string>('uploadsDir') ?? 'uploads');
  }

  private detectType(buf: Buffer): 'jpg' | 'png' | null {
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
    if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
    return null;
  }

  validate(files: Express.Multer.File[] | undefined, existingCount: number, max = MAX_IMAGES_PER_ENTITY) {
    if (!files || files.length === 0) {
      throw new BadRequestException({ message: 'At least one image file is required (field name "images")' });
    }
    if (existingCount + files.length > max) {
      throw new BadRequestException({
        message: `A maximum of ${max} image(s) is allowed; ${existingCount} already attached`,
      });
    }
    for (const f of files) {
      if (f.size > MAX_IMAGE_BYTES) throw new BadRequestException({ message: `${f.originalname} exceeds the 5 MB limit` });
      const t = this.detectType(f.buffer);
      if (!t || !['image/jpeg', 'image/png', 'image/jpg'].includes(f.mimetype)) {
        throw new BadRequestException({ message: `${f.originalname} must be a JPG or PNG image` });
      }
    }
  }

  async save(files: Express.Multer.File[], folder: string): Promise<StoredImage[]> {
    const targetDir = join(this.dir, folder);
    await fs.mkdir(targetDir, { recursive: true });
    const base = (this.config.get<string>('publicBaseUrl') ?? '').replace(/\/$/, '');
    const out: StoredImage[] = [];
    for (const f of files) {
      const ext = this.detectType(f.buffer) as string;
      const filename = `${folder}/${randomUUID()}.${ext}`;
      await fs.writeFile(join(this.dir, filename), f.buffer);
      out.push({ url: `${base}/uploads/${filename}`, filename });
    }
    return out;
  }

  async remove(filename?: string) {
    if (!filename) return;
    const full = resolve(this.dir, filename);
    if (!full.startsWith(this.dir)) return; // path traversal guard
    await fs.unlink(full).catch(() => undefined);
  }
}
