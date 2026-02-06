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
    console.log("[upload-image] Starting upload");
    console.log("[upload-image] Content-Type:", req.headers["content-type"]);
    
    // Lire le body comme buffer
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    console.log("[upload-image] Buffer size:", buffer.length);

    // Parser le multipart manuellement
    const boundary = req.headers["content-type"]?.split("boundary=")[1];
    if (!boundary) {
      console.error("[upload-image] No boundary found");
      return text(res, 400, "Missing boundary");
    }
    console.log("[upload-image] Boundary:", boundary);

    const parts = buffer.toString("binary").split(`--${boundary}`);
    console.log("[upload-image] Parts found:", parts.length);
    
    let fileData = null;
    let filename = "image.jpg";
    let contentType = "image/jpeg";

    for (const part of parts) {
      if (part.includes("Content-Disposition") && part.includes("filename=")) {
        const filenameMatch = part.match(/filename="([^"]+)"/);
        const contentTypeMatch = part.match(/Content-Type: ([^\r\n]+)/);
        
        if (filenameMatch) {
          filename = filenameMatch[1];
          console.log("[upload-image] Filename:", filename);
        }
        if (contentTypeMatch) {
          contentType = contentTypeMatch[1].trim();
          console.log("[upload-image] Content-Type:", contentType);
        }

        const headerEnd = part.indexOf("\r\n\r\n");
        if (headerEnd !== -1) {
          const dataStart = headerEnd + 4;
          const dataEnd = part.lastIndexOf("\r\n");
          if (dataEnd > dataStart) {
            fileData = Buffer.from(part.substring(dataStart, dataEnd), "binary");
            console.log("[upload-image] File data size:", fileData.length);
            break;
          }
        }
      }
    }

    if (!fileData) {
      console.error("[upload-image] No file data found");
      return text(res, 400, "No file found");
    }

    // Vérifier le type
    if (!ALLOWED_TYPES.includes(contentType)) {
      console.error("[upload-image] Invalid type:", contentType);
      return text(res, 400, "Format non supporté. Utilisez jpg, png ou webp.");
    }

    // Vérifier la taille
    if (fileData.length > MAX_SIZE) {
      console.error("[upload-image] File too large:", fileData.length);
      return text(res, 400, "Image trop lourde. Maximum 2MB.");
    }

    // Upload vers Vercel Blob
    console.log("[upload-image] Uploading to Vercel Blob...");
    const blob = await put(filename, fileData, {
      access: "public",
      contentType: contentType,
    });
    console.log("[upload-image] Upload successful:", blob.url);

    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ url: blob.url }));
  } catch (e) {
    console.error("[upload-image] Error details:", {
      message: e.message,
      stack: e.stack,
      name: e.name,
    });
    return text(res, 500, "Upload échoué");
  }
}
