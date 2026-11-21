# Lenslink interface

The studio answers one question first: **is my phone camera ready to use?** Its largest element is the real video surface, initially containing the pairing QR code. The phone screen answers **am I transmitting?**; the clean output contains only video and a fallback audio-unlock action.

The selected design-taste-frontend direction is **True-black flat**, seed **334837423**, with no redraw. A black camera-monitor surface, the overlapping lens mark, and a live phone→computer workflow give it its identity. Inter is loaded through Google Fonts. Accent blue appears only in connected-status data; buttons remain monochrome. No invented telemetry, preview stock photos or placeholder device statistics.

Production-build inspection at 1440, 768 and 390 px found no failures, no horizontal overflow, no unloaded fonts, and no low-contrast text. One `ragged-row` warning is intentionally retained: the preview/transport column and independent camera settings rail have different content heights; stretching either would create empty control panels. The settings rail stacks below the preview on narrow screens.

Modern Web Guidance `html` and `accessibility` informed native controls, sequential headings, named controls, visible focus, status announcements, and a native dialog for session reset. No custom focus trap or synthetic switch roles are used.
