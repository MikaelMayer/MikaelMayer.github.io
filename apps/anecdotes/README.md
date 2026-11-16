
# Family Anecdotes

A one-page web app to collect and reveal meaningful family or group stories — one anecdote at a time.

No account. No backend. Just a shared link and Firebase Realtime Database.

---

## Setup Instructions (with Firebase)

1. **Create a Firebase project** at https://console.firebase.google.com

2. **Enable Realtime Database**  
   - Go to Build > Realtime Database  
   - Create a new database  
   - Start in **test mode**

3. **Set your security rules** (for example, with the token `famillemayerwagnermenoncourt`):

{
  "rules": {
    "stories_YOUROWNTOKEN": {
      ".read": true,
      ".write": true
    },
    "views_YOUROWNTOKEN": {
      "$user": {
        ".read": true,
        ".write": true
      }
    },
    ".read": false,
    ".write": false
  }
}

4. **Copy your Firebase config** (from your app settings) and replace the placeholder in `index.html`:

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project.firebaseio.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "XXXX",
  appId: "XXXX"
};

---

## Usage

- Open the app via a public URL, such as:

  https://yourname.github.io/family-anecdotes/index.html?token=YOUROWNTOKEN

- If no `?token=...` is provided, the app prompts for one.
- If no token is given at all, the app runs in **demo mode** with fake stories.

---

## What it does

- Prompts each user to enter:
  - Their name (saved in cookies)
  - A personal anecdote
  - When it happened
  - Where it took place

- After submission, the user unlocks unread stories contributed by others.

- The app also:
  - Lists users who haven’t read all stories
  - Allows copying the app link with the correct token
  - Lets users reread previous anecdotes

---

## Database Structure

stories_<token>/        → All shared anecdotes  
views_<token>/<name>/   → Tracks which stories each user has read

Each anecdote is stored with:

{
  "name": "Alice",
  "story": "I swam with dolphins!",
  "when": "Last summer",
  "where": "Hawaii",
  "timestamp": 1717000000000
}

---

## License

MIT — use freely, adapt as needed, and share good stories!
