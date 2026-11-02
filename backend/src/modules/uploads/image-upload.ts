import { BadRequestException } from '@nestjs/common';
import { FilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MAX_IMAGE_BYTES, MAX_IMAGES_PER_ENTITY } from '../../common/enums';

const fileFilter = (_req: any, file: Express.Multer.File, cb: (e: Error | null, ok: boolean) => void) => {
  if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.mimetype)) {
    return cb(new BadRequestException({ message: `${file.originalname} must be a JPG or PNG image` }), false);
  }
  cb(null, true);
};

/** Multipart field "images", up to 5 files of <= 5 MB (GEN-08). */
export const ImagesInterceptor = () =>
  FilesInterceptor('images', MAX_IMAGES_PER_ENTITY, {
    storage: memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_IMAGES_PER_ENTITY },
    fileFilter,
  });

/** Multipart field "logo", a single file of <= 5 MB (GEN-08: 1 logo per airline). */
export const LogoInterceptor = () =>
  FileInterceptor('logo', { storage: memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1 }, fileFilter });

export const imagesBodySchema = {
  schema: {
    type: 'object',
    properties: { images: { type: 'array', items: { type: 'string', format: 'binary' } } },
    required: ['images'],
  },
};
export const logoBodySchema = {
  schema: { type: 'object', properties: { logo: { type: 'string', format: 'binary' } }, required: ['logo'] },
};
