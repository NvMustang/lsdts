import { put } from "@vercel/blob";

// Taille max : 2MB
const MAX_SIZE = 2 * 1024 * 1024;

// Formats acceptés
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function text(res, status, message, contentType = "text/plain") {
  res.statusCode = status;
  res.setHeader("content-type", contentType);
  res.end(message);
}

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(data));
}

async function parseMultipartFormData(req) {
  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=([^;]+)/);
  
  if (!boundaryMatch) {
    throw new Error("No boundary found");
  }
  
  const boundary = boundaryMatch[1];
  const chunks = [];
  
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  
  const buffer = Buffer.concat(chunks);
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  
  // Trouver les parties
  const parts = [];
  let start = 0;
  
  while (true) {
    const nextBoundary = buffer.indexOf(boundaryBuffer, start);
    if (nextBoundary === -1) break;
    
    const end = buffer.indexOf(boundaryBuffer, nextBoundary + boundaryBuffer.length);
    if (end === -1) break;
    
    const part = buffer.slice(nextBoundary + boundaryBuffer.length, end);
    parts.push(part);
    start = end;
  }
  
  // Parser chaque partie
  for (const part of parts) {
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) continue;
    
    const headers = part.slice(0, headerEnd).toString();
    const data = part.slice(headerEnd + 4, part.length - 2); // -2 pour enlever \r\n final
    
    if (headers.includes('filename="')) {
      const filenameMatch = headers.match(/filename="([^"]+)"/);
      const contentTypeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);
      
      return {
        filename: filenameMatch ? filenameMatch[1] : "image.jpg",
        contentType: contentTypeMatch ? contentTypeMatch[1].trim() : "image/jpeg",
        data: data,
      };
    }
  }
  
  throw new Error("No file found in multipart data");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    return text(res, 405, "Method not allowed");
  }

  try {
    const file = await parseMultipartFormData(req);

    // Vérifier le type
    if (!ALLOWED_TYPES.includes(file.contentType)) {
      return json(res, 400, { error: "Format non supporté. Utilisez jpg, png ou webp." });
    }

    // Vérifier la taille
    if (file.data.length > MAX_SIZE) {
      return json(res, 400, { error: "Image trop lourde. Maximum 2MB." });
    }

    // Upload vers Vercel Blob
    const blob = await put(file.filename, file.data, {
      access: "public",
      contentType: file.contentType,
    });

    return json(res, 200, { url: blob.url });
  } catch (e) {
    console.error("[upload-image] Error:", e);
    return json(res, 500, { error: "Upload échoué", details: e.message });
  }
}
