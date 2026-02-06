import React, { useState, useRef, useEffect } from "react";

// Dimensions OG : 1200x630
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

export default function ImageCropper({ file, onCrop, onCancel }) {
  const [image, setImage] = useState(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // Charger l'image
  useEffect(() => {
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setImage(img);
        // Calculer le scale initial pour remplir le cadre
        const scaleX = OG_WIDTH / img.width;
        const scaleY = OG_HEIGHT / img.height;
        const initialScale = Math.max(scaleX, scaleY);
        setScale(initialScale);
        // Centrer l'image
        setPosition({
          x: (OG_WIDTH - img.width * initialScale) / 2,
          y: (OG_HEIGHT - img.height * initialScale) / 2,
        });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }, [file]);

  // Dessiner le canvas
  useEffect(() => {
    if (!image || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    
    // Nettoyer le canvas
    ctx.fillStyle = "#fbf7f0";
    ctx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT);
    
    // Dessiner l'image avec la transformation
    ctx.drawImage(
      image,
      position.x,
      position.y,
      image.width * scale,
      image.height * scale
    );
  }, [image, scale, position]);

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !image) return;

    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;

    // Limiter le déplacement pour que l'image reste dans le cadre
    const maxX = 0;
    const minX = OG_WIDTH - image.width * scale;
    const maxY = 0;
    const minY = OG_HEIGHT - image.height * scale;

    setPosition({
      x: Math.min(maxX, Math.max(minX, newX)),
      y: Math.min(maxY, Math.max(minY, newY)),
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    if (!image) return;

    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newScale = Math.max(0.1, Math.min(5, scale + delta));
    
    // Calculer le scale minimal pour remplir le cadre
    const scaleX = OG_WIDTH / image.width;
    const scaleY = OG_HEIGHT / image.height;
    const minScale = Math.max(scaleX, scaleY);
    
    setScale(Math.max(minScale, newScale));
  };

  const handleSliderChange = (e) => {
    if (!image) return;
    
    const value = parseFloat(e.target.value);
    
    // Calculer le scale minimal pour remplir le cadre
    const scaleX = OG_WIDTH / image.width;
    const scaleY = OG_HEIGHT / image.height;
    const minScale = Math.max(scaleX, scaleY);
    
    setScale(Math.max(minScale, value));
  };

  const handleCrop = async () => {
    if (!canvasRef.current) return;

    // Convertir le canvas en blob
    canvasRef.current.toBlob((blob) => {
      onCrop(blob);
    }, "image/jpeg", 0.9);
  };

  // Calculer la taille d'affichage (responsive)
  const displayWidth = Math.min(520, OG_WIDTH);
  const displayHeight = (displayWidth / OG_WIDTH) * OG_HEIGHT;
  const displayScale = displayWidth / OG_WIDTH;

  return (
    <div className="image-cropper">
      <div className="image-cropper-title">Ajuster l'image</div>
      
      <div 
        ref={containerRef}
        className="image-cropper-container"
        style={{
          width: `${displayWidth}px`,
          height: `${displayHeight}px`,
          cursor: isDragging ? "grabbing" : "grab",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <canvas
          ref={canvasRef}
          width={OG_WIDTH}
          height={OG_HEIGHT}
          style={{
            width: "100%",
            height: "100%",
          }}
        />
      </div>

      <div className="image-cropper-controls">
        <label className="formLabel">Zoom</label>
        <input
          type="range"
          min="0.1"
          max="5"
          step="0.1"
          value={scale}
          onChange={handleSliderChange}
          className="image-cropper-slider"
        />
        <div className="formHelper">Glissez l'image pour repositionner</div>
      </div>

      <div className="image-cropper-actions">
        <button 
          className="btn" 
          type="button" 
          onClick={onCancel}
        >
          Annuler
        </button>
        <button 
          className="btn btnPrimary" 
          type="button" 
          onClick={handleCrop}
        >
          Valider
        </button>
      </div>
    </div>
  );
}
