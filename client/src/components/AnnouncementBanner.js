import React, { useEffect, useState, useRef } from 'react';
import { Box, Typography, IconButton, Collapse, Paper } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { AnnouncementService } from '../services/firebaseServices';

// Custom hook to encapsulate announcement subscription and timing logic
function useAnnouncement() {
  const [announcement, setAnnouncement] = useState(null);
  const [open, setOpen] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const showAndMaybeAutoClose = (item, forceOpen = false) => {
      if (!item) return;
      setAnnouncement(item);

      let shouldOpen = true;
      try {
        const lastSeen = localStorage.getItem('ptown:lastSeenAnnouncementId');
        shouldOpen = forceOpen || !lastSeen || lastSeen !== item.id;
      } catch (e) {
        shouldOpen = true;
      }

      if (shouldOpen) {
        setOpen(true);
        clearTimer();
        timerRef.current = setTimeout(() => {
          try { if (item?.id) localStorage.setItem('ptown:lastSeenAnnouncementId', item.id); } catch (e) {}
          setOpen(false);
          timerRef.current = null;
        }, 8000);
      } else {
        setOpen(false);
      }
    };

    const unsub = AnnouncementService.subscribeToAnnouncements((items) => {
      if (items && items.length > 0) {
        showAndMaybeAutoClose(items[0], false);
      } else {
        setAnnouncement(null);
        setOpen(false);
        clearTimer();
      }
    });

    const onShow = (e) => {
      if (e?.detail) {
        // If user explicitly requests, force open and auto-close
        showAndMaybeAutoClose(e.detail, true);
      }
    };
    window.addEventListener('showAnnouncement', onShow);

    return () => {
      unsub && unsub();
      window.removeEventListener('showAnnouncement', onShow);
      clearTimer();
    };
  }, []);

  return { announcement, open, setOpen };
}

const AnnouncementBanner = () => {
  const { announcement, open, setOpen } = useAnnouncement();

  if (!announcement) return null;

  const handleClose = () => {
    try { if (announcement?.id) localStorage.setItem('ptown:lastSeenAnnouncementId', announcement.id); } catch (e) {}
    setOpen(false);
  };

  return (
    <Collapse in={open} timeout={300} appear>
      <Paper elevation={3} sx={{ p: 1.5, mb: 2, bgcolor: 'secondary.light', color: 'white' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{announcement.title || 'Announcement'}</Typography>
            <Typography variant="body2" sx={{ opacity: 0.95 }}>{announcement.message}</Typography>
          </Box>
          <IconButton aria-label="close" onClick={handleClose} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </Box>
      </Paper>
    </Collapse>
  );
};

export default AnnouncementBanner;
