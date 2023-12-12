import os

from hawker_api import *
from datetime import datetime
import datetime as dt
import requests

TELEGRAM_API_KEY = os.environ.get("TELEGRAM_API_KEY")
CHAT_ID = os.environ.get("CHAT_ID")


def clean(text):
    char_list = "_*[]()~`>#+-=|{}.!"
    for char in char_list:
        text = text.replace(char, "\\" + char)
    return text


def send_message(message_text):
    telegram_url = f"https://api.telegram.org/bot{TELEGRAM_API_KEY}/sendMessage?chat_id={CHAT_ID}&text={message_text}&parse_mode=MarkdownV2"
    r = requests.get(telegram_url)
    return r


def format_date_range(start_date_str, end_date_str):
    if start_date_str in INVALID_DATES or end_date_str in INVALID_DATES:
        return "NA"

    start_date = datetime.strptime(start_date_str, "%d/%m/%Y")
    end_date = datetime.strptime(end_date_str, "%d/%m/%Y")
    return f"{start_date.strftime('%d/%m/%Y')} to {end_date.strftime('%d/%m/%Y')}"


def format_hawker_data(hawkers, status):
    formatted_data = ""
    for hawker in hawkers:
        formatted_data += f"📍*[{clean(hawker['name'])}]({clean(hawker['google_3d_view'])})*\n🗺️ {clean(hawker['address_myenv'])}\n"
        if status == "cleaning":
            formatted_data += f"🕗 {clean(format_date_range(hawker[f'q{quarter}_cleaningstartdate'], hawker[f'q{quarter}_cleaningenddate']))}\n"
            formatted_data += (
                f"📝 {clean(hawker[f'remarks_q{quarter}'])}\n\n"
                if not "nil" in hawker[f"remarks_q{quarter}"]
                else "\n"
            )
        elif status == "other_works":
            formatted_data += f"🕗 {clean(format_date_range(hawker['other_works_startdate'], hawker['other_works_enddate']))}\n"
            formatted_data += f"📝 {clean(hawker['remarks_other_works'])}\n\n"
    return formatted_data


current_date = datetime.now().date()
formatted_date = datetime(
    current_date.year, current_date.month, current_date.day
).strftime("%d %b %Y")
current_cleaning, current_other_works, last_modified_date = get_closed_hawkers(
    current_date, current_date
)
if len(current_cleaning) > 25:
    message = f"_Closed Hawkers for {formatted_date}_\n\n"
    message += f"🧹 *CLEANING \({len(current_cleaning)}\)*\n\n"
    message += format_hawker_data(current_cleaning[:25], "cleaning")
    send_message(message)
    message = format_hawker_data(current_cleaning[25:], "cleaning")
    send_message(message)
    message = ""
else:
    message = f"_Closed Hawkers for {formatted_date}_\n\n"
    message += f"🧹 *CLEANING \({len(current_cleaning)}\)*\n\n"
    message += format_hawker_data(current_cleaning, "cleaning")
    message += (
        "_No hawkers are cleaning today, yay\!_\n" if len(current_cleaning) == 0 else ""
    )
message += f"\n🛠 *RENOVATION \({len(current_other_works)}\)*\n\n"
message += format_hawker_data(current_other_works, "other_works")
message += (
    "_No hawkers are closed for other works today, yay\!_"
    if len(current_other_works) == 0
    else ""
)

send_message(message)
