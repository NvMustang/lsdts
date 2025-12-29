import React, { useMemo, useEffect, useRef } from "react";

export default function TimeSlotPicker({ value, onChange }) {
  const dateRef = useRef(null);
  const hourRef = useRef(null);
  const minuteRef = useRef(null);
  
  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const scrollStartRef = useRef(0);

  // Générer les 2 prochains jours (aujourd'hui et demain) - mémorisé
  const dates = useMemo(() => {
    const result = [];
    const now = new Date();
    for (let i = 0; i <= 1; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      d.setHours(0, 0, 0, 0);
      result.push(d);
    }
    return result;
  }, []);

  const currentDate = value || new Date();
  const currentDateKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}-${currentDate.getDate()}`;
  const currentHour = currentDate.getHours();
  const currentMinute = currentDate.getMinutes();
  
  // Arrondir à 00 ou 30 (pour la date sélectionnée)
  const currentRoundedMinute = Math.floor(currentMinute / 30) * 30;
  
  // Vérifier si la date sélectionnée est aujourd'hui
  const todayKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  }, []);
  const isToday = currentDateKey === todayKey;
  
  // Vérifier si la date sélectionnée est demain
  const tomorrowKey = useMemo(() => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return `${tomorrow.getFullYear()}-${tomorrow.getMonth()}-${tomorrow.getDate()}`;
  }, []);
  const isTomorrow = currentDateKey === tomorrowKey;
  
  // Calculer "now arrondi à +30min + 30min" pour la limite minimale de l'événement
  // (même logique que la validation backend : now arrondi + 30 min pour les guests)
  const { nowHour, nowMinute, minEventHour, minEventMinute } = useMemo(() => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    // Arrondir à +30min : si on est à 20:08, on arrondit à 20:30
    // Si on est à 20:30, on arrondit à 21:00
    let roundedMin = Math.ceil((currentMinute + 1) / 30) * 30;
    let roundedH = currentHour;
    
    // Si on dépasse 60 minutes, passer à l'heure suivante
    if (roundedMin >= 60) {
      roundedMin = 0;
      roundedH += 1;
    }
    
    // Date minimum = now arrondi + 30 min pour les guests
    const minEventDate = new Date(now);
    minEventDate.setHours(roundedH, roundedMin, 0, 0);
    minEventDate.setTime(minEventDate.getTime() + 30 * 60 * 1000); // +30 min
    
    return { 
      nowHour: currentHour, 
      nowMinute: currentMinute,
      minEventHour: minEventDate.getHours(),
      minEventMinute: minEventDate.getMinutes()
    };
  }, []);
  
  // Heures disponibles de 0h à 23h
  const hours = useMemo(() => {
    const allHours = Array.from({ length: 24 }, (_, i) => i); // 0h à 23h
    
    if (isTomorrow) {
      // Demain : toutes les heures jusqu'à 23h
      return allHours;
    }
    
    if (isToday) {
      // Aujourd'hui : à partir de l'heure minimum de l'événement
      // Si l'heure minimum dépasse 23h, pas d'heures disponibles aujourd'hui
      // (on passera automatiquement à demain)
      if (minEventHour >= 24) return [];
      
      // Filtrer les heures : garder celles >= à l'heure minimum
      return allHours.filter(h => h >= minEventHour);
    }
    
    return allHours;
  }, [isToday, isTomorrow, minEventHour]);
  
  // Minutes disponibles (seulement 00 ou 30)
  const availableMinutes = useMemo(() => {
    const allMinutes = [0, 30];
    
    if (isTomorrow) {
      // Demain : toutes les minutes (00 ou 30)
      return allMinutes;
    }
    
    if (isToday) {
      // Aujourd'hui : à partir de l'heure minimum de l'événement
      // Si on est sur l'heure minimum, filtrer les minutes
      if (currentHour === minEventHour) {
        return allMinutes.filter(m => m >= minEventMinute);
      }
      
      // Si on est après l'heure minimum, toutes les minutes sont disponibles
      if (currentHour > minEventHour) {
        return allMinutes;
      }
      
      // Si on est avant l'heure minimum, aucune minute disponible
      return [];
    }
    
    return allMinutes;
  }, [isToday, isTomorrow, currentHour, minEventHour, minEventMinute]);

  const handleScroll = (type, ref) => {
    if (!ref.current) return;
    const container = ref.current;
    const itemHeight = 40;
    const scrollTop = container.scrollTop;
    const index = Math.round(scrollTop / itemHeight);
    
    const newDate = new Date(value || new Date());
    
    if (type === 'date') {
      const selectedDate = dates[index];
      if (selectedDate) {
        newDate.setFullYear(selectedDate.getFullYear());
        newDate.setMonth(selectedDate.getMonth());
        newDate.setDate(selectedDate.getDate());
      }
    } else if (type === 'hour') {
      const hour = hours[index];
      if (hour !== undefined) newDate.setHours(hour);
    } else if (type === 'minute') {
      const minute = availableMinutes[index];
      if (minute !== undefined) newDate.setMinutes(minute);
    }
    
    onChange(newDate);
  };

  const handleMouseDown = (e, ref) => {
    isDraggingRef.current = true;
    startYRef.current = e.clientY;
    scrollStartRef.current = ref.current?.scrollTop || 0;
    if (ref.current) {
      ref.current.style.cursor = 'grabbing';
      ref.current.style.scrollSnapType = 'none';
    }
  };

  const handleMouseMove = (e, ref) => {
    if (!isDraggingRef.current || !ref.current) return;
    const deltaY = startYRef.current - e.clientY;
    ref.current.scrollTop = scrollStartRef.current + deltaY;
  };

  const handleMouseUp = (ref) => {
    if (!ref.current) return;
    isDraggingRef.current = false;
    ref.current.style.cursor = 'grab';
    ref.current.style.scrollSnapType = 'y mandatory';
  };

  const handleItemClick = (type, index) => {
    const newDate = new Date(value || new Date());
    
    if (type === 'date') {
      const selectedDate = dates[index];
      if (selectedDate) {
        newDate.setFullYear(selectedDate.getFullYear());
        newDate.setMonth(selectedDate.getMonth());
        newDate.setDate(selectedDate.getDate());
      }
    } else if (type === 'hour') {
      const hour = hours[index];
      if (hour !== undefined) newDate.setHours(hour);
    } else if (type === 'minute') {
      const minute = availableMinutes[index];
      if (minute !== undefined) newDate.setMinutes(minute);
    }
    
    onChange(newDate);
  };

  useEffect(() => {
    // Centrer initialement sur les valeurs actuelles
    const dateIndex = dates.findIndex(d => 
      `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` === currentDateKey
    );
    const hourIndex = hours.findIndex(h => h === currentHour);
    const minuteIndex = availableMinutes.indexOf(currentRoundedMinute);

    if (dateRef.current && dateIndex >= 0) {
      dateRef.current.scrollTop = dateIndex * 40;
    }
    if (hourRef.current && hourIndex >= 0) {
      hourRef.current.scrollTop = hourIndex * 40;
    }
    if (minuteRef.current && minuteIndex >= 0) {
      minuteRef.current.scrollTop = minuteIndex * 40;
    }
  }, [dates, currentDateKey, hours, currentHour, currentRoundedMinute, availableMinutes]);

  const pickerStyle = {
    display: 'flex',
    gap: '4px',
    height: '160px',
    position: 'relative',
  };

  const columnStyle = {
    flex: 1,
    height: '100%',
    overflowY: 'scroll',
    scrollSnapType: 'y mandatory',
    borderRadius: '8px',
    border: '1px solid #e6ddcf',
    background: '#fffdfa',
    position: 'relative',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
    cursor: 'grab',
  };

  const itemStyle = {
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    scrollSnapAlign: 'center',
    fontSize: '14px',
    fontWeight: '700',
    color: '#1f2933',
    userSelect: 'none',
    cursor: 'pointer',
  };

  const overlayStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const highlightStyle = {
    width: '100%',
    height: '40px',
    border: '2px solid #1f7ae0',
    borderRadius: '6px',
    background: 'rgba(31, 122, 224, 0.08)',
  };

  return (
    <div style={pickerStyle}>
      {/* Dates */}
      <div 
        ref={dateRef}
        style={columnStyle}
        onScroll={() => handleScroll('date', dateRef)}
        onMouseDown={(e) => handleMouseDown(e, dateRef)}
        onMouseMove={(e) => handleMouseMove(e, dateRef)}
        onMouseUp={() => handleMouseUp(dateRef)}
        onMouseLeave={() => handleMouseUp(dateRef)}
      >
        <div style={{ height: '60px' }} />
        {dates.map((d, i) => {
          const label = i === 0 
            ? `Aujourd'hui`
            : i === 1
            ? `Demain`
            : d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' });
          return <div key={i} style={itemStyle} onClick={() => handleItemClick('date', i)}>{label}</div>;
        })}
        <div style={{ height: '60px' }} />
      </div>

      {/* Heures */}
      <div 
        ref={hourRef}
        style={{ ...columnStyle, flex: '0 0 50px' }}
        onScroll={() => handleScroll('hour', hourRef)}
        onMouseDown={(e) => handleMouseDown(e, hourRef)}
        onMouseMove={(e) => handleMouseMove(e, hourRef)}
        onMouseUp={() => handleMouseUp(hourRef)}
        onMouseLeave={() => handleMouseUp(hourRef)}
      >
        <div style={{ height: '60px' }} />
        {hours.map((h, i) => (
          <div key={i} style={itemStyle} onClick={() => handleItemClick('hour', i)}>{String(h).padStart(2, '0')}</div>
        ))}
        <div style={{ height: '60px' }} />
      </div>

      {/* Séparateur ":" */}
      <div style={{ display: 'flex', alignItems: 'center', fontSize: '18px', fontWeight: '700', color: '#1f2933', userSelect: 'none' }}>:</div>

      {/* Minutes */}
      <div 
        ref={minuteRef}
        style={{ ...columnStyle, flex: '0 0 50px' }}
        onScroll={() => handleScroll('minute', minuteRef)}
        onMouseDown={(e) => handleMouseDown(e, minuteRef)}
        onMouseMove={(e) => handleMouseMove(e, minuteRef)}
        onMouseUp={() => handleMouseUp(minuteRef)}
        onMouseLeave={() => handleMouseUp(minuteRef)}
      >
        <div style={{ height: '60px' }} />
        {availableMinutes.map((minute, i) => (
          <div key={i} style={itemStyle} onClick={() => handleItemClick('minute', i)}>
            {String(minute).padStart(2, '0')}
          </div>
        ))}
        <div style={{ height: '60px' }} />
      </div>

      {/* Overlay highlight */}
      <div style={overlayStyle}>
        <div style={highlightStyle} />
      </div>
    </div>
  );
}
