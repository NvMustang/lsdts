import { put } from "@vercel/blob";
import { text } from "./_sheets.js";

// Taille max : 2MB
const MAX_SIZE = 2 * 1024 * 1024;

// Formats acceptés
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    return text(res, 400, "Method not allowed");
  }

  try {
    // Lire le body comme buffer
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Parser le multipart manuellement
    const boundary = req.headers["content-type"]?.split("boundary=")[1];
    if (!boundary) {
      return text(res, 400, "Missing boundary");
    }

    const parts = buffer.toString("binary").split(`--${boundary}`);
    let fileData = null;
    let filename = "image.jpg";
    let contentType = "image/jpeg";

    for (const part of parts) {
      if (part.includes("Content-Disposition") && part.includes("filename=")) {
        const filenameMatch = part.match(/filename="([^"]+)"/);
        const contentTypeMatch = part.match(/Content-Type: ([^\r\n]+)/);
        
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
        if (contentTypeMatch) {
          contentType = contentTypeMatch[1].trim();
        }

        const headerEnd = part.indexOf("\r\n\r\n");
        if (headerEnd !== -1) {
          const dataStart = headerEnd + 4;
          const dataEnd = part.lastIndexOf("\r\n");
          if (dataEnd > dataStart) {
            fileData = Buffer.from(part.substring(dataStart, dataEnd), "binary");
            break;
          }
        }
      }
    }

    if (!fileData) {
      return text(res, 400, "No file found");
    }

    // Vérifier le type
    if (!ALLOWED_TYPES.includes(contentType)) {
      return text(res, 400, "Format non supporté. Utilisez jpg, png ou webp.");
    }

    // Vérifier la taille
    if (fileData.length > MAX_SIZE) {
      return text(res, 400, "Image trop lourde. Maximum 2MB.");
    }

    // Upload vers Vercel Blob
    const blob = await put(filename, fileData, {
      access: "public",
      contentType: contentType,
    });

    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ url: blob.url }));
  } catch (e) {
    console.error("[upload-image] Error:", e);
    return text(res, 500, "Upload échoué");
  }
}
