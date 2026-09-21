# Bi0z Rare Hunter
Web-based Habbo username checker.

## Deploy on Render
1. Push this folder to a GitHub repository.
2. In Render choose New > Web Service and connect the repository (or use the included `render.yaml`).
3. Build: `pip install -r requirements.txt`
4. Start: `gunicorn app:app`

The app deliberately labels a missing public Habbo profile as **candidate**, not guaranteed available.
