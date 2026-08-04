# TsunagariCare Canonical Paths

## Backend

Production backend exists only in:

`server/`

Never create or modify:

`tsunagari-care/server/`

## Frontend

Production frontend exists only in:

`tsunagari-care/`

Frontend files include:

- `tsunagari-care/index.html`
- `tsunagari-care/src/`
- `tsunagari-care/fall-camera.html`
- `tsunagari-care/fall-camera.css`
- `tsunagari-care/fall-camera.js`

Never create root frontend files such as:

- `index.html`
- `src/`
- `fall-camera.*`

## Documentation

Project-wide documentation belongs in:

`docs/`

## History

All changes must be recorded only in:

`PROJECT_HISTORY.md`

## Safety

Before editing a file, confirm it is in a canonical path.

Never run:

- `git add .`
- `git clean`
- `git reset --hard`

Never commit:

- `.env`
- Firebase Admin service accounts
- LINE tokens
- device tokens
- private keys

Do not create temporary source-copy folders inside the repository.

Firebase Web Config for the GitHub Pages frontend may live in
`tsunagari-care/src/js/firebase-config.js`, but Admin credentials and private
tokens must never be placed in frontend files.
