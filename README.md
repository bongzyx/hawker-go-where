<br />
<div align="center">
  <h1 align="center">HawkerGoWhere</h1>

<p align="center">
  Telegram bot that shows nearby hawker centres in Singapore and checks if they are closed for cleaning/other works.
</p>
</div>

<p align="center">
  <img src="https://img.shields.io/badge/Telegram-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white.svg">
  <img src="https://img.shields.io/badge/Python-FFD43B?style=for-the-badge&logo=python&logoColor=blue.svg">
  <img src="https://img.shields.io/badge/Github%20Actions-282a2e?style=for-the-badge&logo=githubactions&logoColor=367cfe.svg">
</p>


## About The Project

Annoyed that a hawker centre is closed for whatever reason? Not sure where to eat and want to get nearby hawkers? This bot can help you.

### Screenshots

<p align="center" width="100%">
  <img width="23%" padding="2px" src="assets/nearby.png?raw=true">
  <img width="23%" padding="2px" src="assets/closed_today.png?raw=true">
  <img width="23%" padding="2px" src="assets/search.png?raw=true">
  <img width="23%" padding="2px" src="assets/hawker_info.png?raw=true">
</p>

### Key Features

- Seach for hawkers using InlineKeyboard, returns detailed information of hawker such as address, Google Maps 3D view, past and future cleaning schedule for the year
- Get closed hawkers for today, tomorrow and this week
- Get nearest hawkers using button to share current location or search for pin location

#### Command List

- `/nearest` - get hawkers near you
- `/cleaning` - hawkers closed for cleaning
- `/otherworks` - hawkers under renovation or other works
- `/closedtoday` - get all hawkers closed today
- `/closedtomorrow` - get all hawkers closed tomorrow
- `/closedthisweek` - get all hawkers closed this week
- `/search` - search for any hawker


## Usage

Search up `@HawkerGoWhereBot` or go to [this link](https://t.me/HawkerGoWhereBot).

### Installation

To run your own local copy of the bot or for reference if I want to deploy on a new server:

1. Get your token from @BotFather
2. Clone the repo
3. Install packages using pip3
   
   ```sh
   pip3 install -r requirements.txt
   ```
4. Add your token in `.env` file
   
   ```
   TELEGRAM_API_KEY=xxx:xxx
   ```
5. Make ./scripts/pull_latest_changes.sh executable

   ```
   chmod +x ./scripts/pull_latest_changes.sh
   ```
6. Add to crontab `crontab -e`
7. Customise your schedule. The following runs daily at 12am.
   ```
   0 0 * * * /path/to/pull_latest_changes.sh
   ```
8. Use any tmux or run script in background
   ```
   python3 hawker_go_where_bot.py
   ```

## Architecture

Deploment Machine <- Git Repo <- GitHub Actions Workflow

1. GitHub Actions will run `check_for_updates.py` everyday at 7pm SGT to pull changes from `data.gov.sg`
2. If there are changes, new data will be saved and changelog will be generated. All of this will be automatically pushed back to the repo.
3. Deployment machine will have cron job to `git pull` changes daily at 12am

## Roadmap

- [ ] Get closed hawkers using custom timeframe
- [ ] Filter nearby hawkers by status
- [ ] Add hawkers not covered by NEA (eg Timbre+)
