const cloudinary = require("cloudinary").v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Uploads a file buffer to Cloudinary.
 * @param {Buffer} fileBuffer - File buffer from multer
 * @param {string} folder - Target folder in Cloudinary
 * @returns {Promise<object>} Cloudinary upload response
 */
const uploadImage = (fileBuffer, folder = "german-bharatham") => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: "auto",
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        resolve(result);
      }
    );
    uploadStream.end(fileBuffer);
  });
};

/**
 * Deletes an image from Cloudinary using its public ID.
 * @param {string} publicId - Cloudinary public ID of the resource
 * @returns {Promise<object>} Cloudinary destroy response
 */
const deleteImage = (publicId) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, (error, result) => {
      if (error) {
        return reject(error);
      }
      resolve(result);
    });
  });
};

/**
 * Uploads a base64 string/data URL to Cloudinary.
 * @param {string} base64Str - Base64 data URL string
 * @param {string} folder - Target folder in Cloudinary
 * @returns {Promise<object>} Cloudinary upload response
 */
const uploadBase64 = async (base64Str, folder = "german-bharatham") => {
  return cloudinary.uploader.upload(base64Str, {
    folder: folder,
    resource_type: "auto",
  });
};

module.exports = {
  uploadImage,
  uploadBase64,
  deleteImage,
};
