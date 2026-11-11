# Landing page: demo request form and demo video
Date: 2026-11-11

## Intent
A visitor who asks for a demo gives name, email and phone in a form on the landing page; once it is sent, the
demo video plays in a player window inside the app. The link is never shown or sent.

## Key decisions
- Decision: requests are stored (`demo_requests`, migration `0066`, D56) and listed for Super Admins on Admin ->
  Demo Requests (mark contacted / mark as new, audited); every Super Admin gets an in-app notification. Nothing is
  emailed. Owner's choice over "also email" and "stored only".
- Decision: the video plays in YouTube's privacy-enhanced embedded player (youtube-nocookie.com, no related
  videos). The page holds no link or id until the server has stored the request and returns the id. Owner's
  choice, accepting that a determined person can find the id in the browser's developer tools.
- Decision (agent's): the video id is configuration, `org_settings.demo_video` (`{"youtubeId": "sZqR5HWQZ6Y"}`); no
  screen edits it yet.
- Decision (agent's): 5 requests per client address per hour; name 2-120 characters, a valid email, a phone of
  7-15 digits with +, spaces, hyphens or brackets.

## Open questions
- A screen to change the video; whether to email requests later; how long requests are kept (privacy notice).
