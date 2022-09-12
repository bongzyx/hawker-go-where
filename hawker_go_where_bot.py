from datetime import datetime, timedelta
from dotenv import dotenv_values

from telegram import (
    Update,
    ReplyKeyboardMarkup,
    KeyboardButton,
)
from telegram.ext import (
    Updater,
    CommandHandler,
    CallbackContext,
    MessageHandler,
    Filters,
)


import hawker_api

dot_env = dotenv_values(".env")
TELEGRAM_API_KEY = dot_env.get("TELEGRAM_API_KEY")

# *bold \*text*
# _italic \*text_
# __underline__
# ~strikethrough~
# *bold _italic bold ~italic bold strikethrough~ __underline italic bold___ bold*
# [inline URL](http://www.example.com/)
# [inline mention of a user](tg://user?id=123456789)
# `inline fixed-width code`
# ```
# pre-formatted fixed-width code block
# ```
# ```python
# pre-formatted fixed-width code block written in the Python programming language
# ```

"""
Commands: 
nearest - get hawker centres near you
cleaning - get current hawkers that are closed for cleaning
otherworks - get current hawkers that are closed for renovation or other works
"""

new_line = "\n"


def clean_output(text):
    return (
        text.replace("(", "\(")
        .replace(")", "\)")
        .replace("_", "\\_")
        .replace("[", "\\[")
        .replace("`", "\\`")
        .replace("-", "\\-")
        .replace(".", "\\.")
        .replace("*", "\\*")
        .replace("+", "\\+")
        .replace("=", "\\=")
        .replace("!", "\\!")
    )


def hello(update: Update, context: CallbackContext) -> None:
    update.message.reply_text(f"yo {update.effective_user.first_name}")


def nearest_hawkers(update, context):
    keyboard = [[KeyboardButton(text="📍 Share Location", request_location=True)]]
    context.bot.send_message(
        chat_id=update.effective_chat.id,
        text="Please send your/any location here...",
        reply_markup=ReplyKeyboardMarkup(
            keyboard, resize_keyboard=True, one_time_keyboard=True
        ),
    )


def location(update, context):
    user_loc = update.message.location
    print(user_loc)
    output_string = ""
    if user_loc:
        results, last_modified_date = hawker_api.get_nearest_hawkers(user_loc)
        for r in results[:10]:
            output_string += f"*📍[{clean_output(r['name'])}]({clean_output(r['photourl'])}) \(\~{clean_output(str(round(r['relativeDistance'], 2)))}km\)*\n{r['address_myenv']}\n🍽 Stalls: {r['no_of_food_stalls']}   🐟 Stalls: {r['no_of_market_stalls']}\n🗺 {clean_output(r['google_3d_view'])}\n\n"
        output_string += f"\n_updated {last_modified_date}_"
        update.message.reply_text(text=output_string, parse_mode="MarkdownV2")


def cleaning_hawkers(update, context):
    output_string = ""
    results, last_modified_date, quarter = hawker_api.get_all_cleaning()
    for r in results[:10]:
        output_string += f"*📍[{clean_output(r['name'])}]({clean_output(r['google_3d_view'])})*\n{clean_output(r['address_myenv'])}\n⏱ {r[f'q{quarter}_cleaningstartdate']} to {r[f'q{quarter}_cleaningenddate']}\n📝 {clean_output(r[f'remarks_q{quarter}'])}\n\n"
    output_string += f"\n_updated {last_modified_date}_"
    update.message.reply_text(text=output_string, parse_mode="MarkdownV2")


def otherworks_hawkers(update, context):
    output_string = ""
    results, last_modified_date = hawker_api.get_all_other_works()
    for r in results[:10]:
        output_string += f"*📍[{clean_output(r['name'])}]({clean_output(r['google_3d_view'])})*\n{clean_output(r['address_myenv'])}\n⏱ {r[f'other_works_startdate']} to {r[f'other_works_enddate']}\n📝 {clean_output(r[f'remarks_other_works'])}\n\n"
    output_string += f"\n_updated {last_modified_date}_"
    update.message.reply_text(text=output_string, parse_mode="MarkdownV2")


def closed_today(update, context):
    output_string = ""
    output_string += "🛠 *__RENOVATION__*\n"
    results, last_modified_date = hawker_api.get_all_other_works()
    for r in results:
        start_date = datetime.strptime(r[f"other_works_startdate"], "%d/%m/%Y")
        end_date = datetime.strptime(r[f"other_works_enddate"], "%d/%m/%Y")
        if (
            start_date
            <= datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            <= end_date
        ):
            output_string += f"*📍[{clean_output(r['name'])}]({clean_output(r['google_3d_view'])})*\n{clean_output(r['address_myenv'])}\n⏱ {r[f'other_works_startdate']} to {r[f'other_works_enddate']}\n📝 {clean_output(r[f'remarks_other_works'])}\n\n"
    results, last_modified_date, quarter = hawker_api.get_all_cleaning()
    output_string += "🧹 *__CLEANING__*\n"
    for r in results:
        start_date = datetime.strptime(r[f"q{quarter}_cleaningstartdate"], "%d/%m/%Y")
        end_date = datetime.strptime(r[f"q{quarter}_cleaningenddate"], "%d/%m/%Y")
        if (
            start_date
            <= datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            <= end_date
        ):
            output_string += f"*📍[{clean_output(r['name'])}]({clean_output(r['google_3d_view'])})*\n{clean_output(r['address_myenv'])}\n⏱ {r[f'q{quarter}_cleaningstartdate']} to {r[f'q{quarter}_cleaningenddate']}\n📝 {clean_output(r[f'remarks_q{quarter}'])}\n\n"

    output_string += f"\n_updated {last_modified_date}_"
    print(output_string)
    update.message.reply_text(text=output_string, parse_mode="MarkdownV2")


def closed_this_week(update, context):
    current_date = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    next_week_date = datetime.now().replace(
        hour=0, minute=0, second=0, microsecond=0
    ) + timedelta(days=2)

    output_string = ""

    output_string += "🛠 *__RENOVATION__*\n"
    results, last_modified_date = hawker_api.get_all_other_works()
    for r in results:
        start_date = datetime.strptime(r[f"other_works_startdate"], "%d/%m/%Y")
        end_date = datetime.strptime(r[f"other_works_enddate"], "%d/%m/%Y")
        if (
            current_date <= start_date <= next_week_date
            or start_date <= current_date <= end_date
        ):
            output_string += f"*📍[{clean_output(r['name'])}]({clean_output(r['google_3d_view'])})*\n{clean_output(r['address_myenv'])}\n⏱ {r[f'other_works_startdate']} to {r[f'other_works_enddate']}\n📝 {clean_output(r[f'remarks_other_works'])}\n\n"

    output_string += "🧹 *__CLEANING__*\n"
    results, last_modified_date, quarter = hawker_api.get_all_cleaning()
    for r in results:
        start_date = datetime.strptime(r[f"q{quarter}_cleaningstartdate"], "%d/%m/%Y")
        end_date = datetime.strptime(r[f"q{quarter}_cleaningenddate"], "%d/%m/%Y")
        if (
            current_date <= start_date <= next_week_date
            or start_date <= current_date <= end_date
        ):
            output_string += f"*📍[{clean_output(r['name'])}]({clean_output(r['google_3d_view'])})*\n{clean_output(r['address_myenv'])}\n⏱ {r[f'q{quarter}_cleaningstartdate']} to {r[f'q{quarter}_cleaningenddate']}\n📝 {clean_output(r[f'remarks_q{quarter}'])}\n\n"

    output_string += f"\n_updated {last_modified_date}_"
    update.message.reply_text(text=output_string, parse_mode="MarkdownV2")


def update(update, context):
    updated_date = hawker_api.update()
    update.message.reply_text(text=updated_date)


updater = Updater(TELEGRAM_API_KEY)
updater.dispatcher.add_handler(CommandHandler("hello", hello))
updater.dispatcher.add_handler(CommandHandler("nearest", nearest_hawkers))
updater.dispatcher.add_handler(CommandHandler("cleaning", cleaning_hawkers))
updater.dispatcher.add_handler(CommandHandler("otherworks", otherworks_hawkers))
updater.dispatcher.add_handler(CommandHandler("closedtoday", closed_today))
updater.dispatcher.add_handler(CommandHandler("closedthisweek", closed_this_week))
updater.dispatcher.add_handler(CommandHandler("update", update))
updater.dispatcher.add_handler(MessageHandler(Filters.location, location))

updater.start_polling()
updater.idle()
