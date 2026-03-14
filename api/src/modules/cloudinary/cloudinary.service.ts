import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  async uploadImage(buffer: Buffer, folder: string, publicId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder,
            public_id: publicId,
            overwrite: true,
            resource_type: 'image',
            transformation: [{ quality: 'auto', fetch_format: 'auto' }],
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result!.secure_url);
          },
        )
        .end(buffer);
    });
  }

  async deleteImage(folder: string, publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(`${folder}/${publicId}`, {
      resource_type: 'image',
    });
  }
}
