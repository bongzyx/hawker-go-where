import logging
from html import escape
from uuid import uuid4

from dotenv import dotenv_values

from telegram import (
    InlineQueryResultArticle,
    InputTextMessageContent,
    ReplyKeyboardMarkup,
    KeyboardButton,
    Update,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
)
from telegram.constants import ParseMode
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    InlineQueryHandler,
    MessageHandler,
    filters,
)

from hawker_api import *
from datetime import datetime
import datetime as dt

current_mth = datetime.now().month
quarter = (
    1 if current_mth < 4 else 2 if current_mth < 7 else 3 if current_mth < 10 else 4
)
INVALID_DATES = ["TBC", "NA", "#N/A"]


def clean(text):
    char_list = "_*[]()~`>#+-=|{}.!"
    for char in char_list:
        text = text.replace(char, "\\" + char)
    return text


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


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send a welcome message when the command /start is issued."""
    welcome_message = (
        "👋 Hello\! Welcome to *HawkerGoWhere*\! 🇸🇬\n\n"
        "I'm here to help you find hawker centres in Singapore and check their status\.\n\n"
        "Here are some things you can do\:\n"
        "\- 📍 Get hawkers near your location using the /nearest command\.\n"
        "\- 🧹 Check which hawkers are closed for cleaning with /cleaning\.\n"
        "\- 🛠 Learn about hawkers undergoing renovations with /otherworks\.\n"
        "\- 📅 Get lists of hawkers closed today, tomorrow, or this week using /closedtoday, /closedtomorrow, and /closedthisweek\.\n"
        "\- 🔍 Search for any specific hawker with the /search command\.\n\n"
        "Just tap on any of the commands above or type in a query\. Let's get started\!"
    )
    keyboard = [
        [InlineKeyboardButton("🔍 Search for Hawker", switch_inline_query_current_chat="")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    message = await update.message.reply_text(welcome_message, parse_mode=ParseMode.MARKDOWN_V2, reply_markup=reply_markup)

    await context.bot.pin_chat_message(chat_id=update.effective_chat.id, message_id=message.message_id)

async def inline_query(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the inline query. This is run when you type: @botusername <query>"""
    query = update.inline_query.query

    if not query:
        return

    filtered_hawkers = search_hawker(query)

    if filtered_hawkers:
        results = [
            InlineQueryResultArticle(
                id=str(hawker["serial_no"]),
                title=hawker["name"],
                thumbnail_url=hawker.get("photourl"),
                description=hawker.get("address_myenv"),
                input_message_content=InputTextMessageContent(
                    f"/hawkerinfo {hawker.get('serial_no')}",
                    parse_mode=ParseMode.MARKDOWN_V2,
                ),
            )
            for hawker in filtered_hawkers
        ]
    else:
        results = [
            InlineQueryResultArticle(
                id=0,
                title="No results found",
                description="Kindly refine your search query",
                input_message_content=InputTextMessageContent(
                    f"Search", parse_mode=ParseMode.MARKDOWN_V2
                ),
            )
        ]

    await update.inline_query.answer(results[:10])


async def cleaning_hawkers(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    current_date = datetime.now().date()
    current_cleaning, _, last_modified_date = get_closed_hawkers(
        current_date, current_date
    )
    message = f"🧹 *CLEANING \({len(current_cleaning)}\)*\n\n"
    message += format_hawker_data(current_cleaning, "cleaning")
    message += (
        "_No hawkers are cleaning today, yay\!_\n\n"
        if len(current_cleaning) == 0
        else ""
    )
    message += f"_updated {clean(last_modified_date)[:12]}_"
    await update.message.reply_text(message, parse_mode="MarkdownV2")


async def otherworks_hawkers(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    current_date = datetime.now().date()
    _, current_other_works, last_modified_date = get_closed_hawkers(
        current_date, current_date
    )
    message = f"🛠 *RENOVATION \({len(current_other_works)}\)*\n\n"
    message += format_hawker_data(current_other_works, "other_works")
    message += (
        "_No hawkers are closed for other works today, yay\!_\n\n"
        if len(current_other_works) == 0
        else ""
    )
    message += f"_updated {clean(last_modified_date)[:12]}_"
    await update.message.reply_text(message, parse_mode="MarkdownV2")


async def closed_hawkers_today(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
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
        await update.message.reply_text(message, parse_mode="MarkdownV2")
        message = format_hawker_data(current_cleaning[25:], "cleaning")
        await update.message.reply_text(message, parse_mode="MarkdownV2")
        message = ""
    else:
        message = f"_Closed Hawkers for {formatted_date}_\n\n"
        message += f"🧹 *CLEANING \({len(current_cleaning)}\)*\n\n"
        message += format_hawker_data(current_cleaning, "cleaning")
        message += (
            "_No hawkers are cleaning today, yay\!_\n"
            if len(current_cleaning) == 0
            else ""
        )
    message += f"\n🛠 *RENOVATION \({len(current_other_works)}\)*\n\n"
    message += format_hawker_data(current_other_works, "other_works")
    message += (
        "_No hawkers are closed for other works today, yay\!_\n\n"
        if len(current_other_works) == 0
        else ""
    )
    message += f"_updated {clean(last_modified_date)[:12]}_"
    await update.message.reply_text(message, parse_mode="MarkdownV2")


async def closed_hawkers_tomorrow(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    current_date = datetime.now().date()
    tomorrow = current_date + timedelta(days=1)
    formatted_date = datetime(tomorrow.year, tomorrow.month, tomorrow.day).strftime(
        "%d %b %Y"
    )
    current_cleaning, current_other_works, last_modified_date = get_closed_hawkers(
        tomorrow, tomorrow
    )
    if len(current_cleaning) > 25:
        message = f"_Closed Hawkers for {formatted_date}_\n\n"
        message += f"🧹 *CLEANING \({len(current_cleaning)}\)*\n\n"
        message += format_hawker_data(current_cleaning[:25], "cleaning")
        await update.message.reply_text(message, parse_mode="MarkdownV2")
        message = format_hawker_data(current_cleaning[25:], "cleaning")
        await update.message.reply_text(message, parse_mode="MarkdownV2")
        message = ""
    else:
        message = f"_Closed Hawkers for {formatted_date}_\n\n"
        message += f"🧹 *CLEANING \({len(current_cleaning)}\)*\n\n"
        message += format_hawker_data(current_cleaning, "cleaning")
        message += (
            "_No hawkers are cleaning tomorrow, yay\!_\n"
            if len(current_cleaning) == 0
            else ""
        )
    message += f"\n🛠 *RENOVATION \({len(current_other_works)}\)*\n\n"
    message += format_hawker_data(current_other_works, "other_works")
    message += (
        "_No hawkers are closed for other works tomorrow, yay\!_\n\n"
        if len(current_other_works) == 0
        else ""
    )
    message += f"_updated {clean(last_modified_date)[:12]}_"
    await update.message.reply_text(message, parse_mode="MarkdownV2")


async def closed_hawkers_this_week(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    current_date = datetime.now().date()
    end_date = current_date + timedelta(weeks=1)
    formatted_current_date = datetime(
        current_date.year, current_date.month, current_date.day
    ).strftime("%d %b %Y")
    formatted_end_date = datetime(end_date.year, end_date.month, end_date.day).strftime(
        "%d %b %Y"
    )
    current_cleaning, current_other_works, last_modified_date = get_closed_hawkers(
        current_date, end_date
    )
    if len(current_cleaning) > 25:
        message = (
            f"_Closed Hawkers for {formatted_current_date} to {formatted_end_date}_\n\n"
        )
        message += f"🧹 *CLEANING \({len(current_cleaning)}\)*\n\n"
        message += format_hawker_data(current_cleaning[:25], "cleaning")
        await update.message.reply_text(message, parse_mode="MarkdownV2")
        message = format_hawker_data(current_cleaning[25:], "cleaning")
        await update.message.reply_text(message, parse_mode="MarkdownV2")
        message = ""
    else:
        message = (
            f"_Closed Hawkers for {formatted_current_date} to {formatted_end_date}_\n\n"
        )
        message += f"🧹 *CLEANING \({len(current_cleaning)}\)*\n\n"
        message += format_hawker_data(current_cleaning, "cleaning")
        message += (
            "_No hawkers are cleaning this week, yay\!_\n"
            if len(current_cleaning) == 0
            else ""
        )
    message += f"\n🛠 *RENOVATION \({len(current_other_works)}\)*\n\n"
    message += format_hawker_data(current_other_works, "other_works")
    message += (
        "_No hawkers are closed for other works this week, yay\!_\n\n"
        if len(current_other_works) == 0
        else ""
    )
    message += f"_updated {clean(last_modified_date)[:12]}_"
    await update.message.reply_text(message, parse_mode="MarkdownV2")


async def nearest_hawkers(update, context):
    keyboard = [[KeyboardButton(text="📍 Share Location", request_location=True)]]
    await update.message.reply_text(
        text="Please send your/any location here...",
        reply_markup=ReplyKeyboardMarkup(
            keyboard, resize_keyboard=True, one_time_keyboard=True
        ),
    )


async def search(update, context):
    keyboard = [
        [InlineKeyboardButton("Search", switch_inline_query_current_chat="")],
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text(
        "Please search using this button:", reply_markup=reply_markup
    )


async def hawker_info(update, context):
    serial_no = context.args[0]
    hawker_result = search_hawker(serial_no=serial_no)
    if hawker_result:
        hawker_result = hawker_result[0]
        message = ""
        message += (
            f"📍 *[{clean(hawker_result['name'])}]({hawker_result['photourl']} 🗺)*\n"
        )
        message += f"✅ *Status:* {clean(hawker_result['status'])}\n"
        message += f"🗺️ *Address:* {clean(hawker_result['address_myenv'])}\n"
        message += f"📝 *Description:*\n{clean(hawker_result['description_myenv'])}\n"
        message += (
            f"🐟 *Number of Market Stalls:* {hawker_result['no_of_market_stalls']}\n"
        )
        message += f"🍽 *Number of Food Stalls:* {hawker_result['no_of_food_stalls']}\n"
        message += "🧹 *Cleaning Dates:*\n"
        message += f"    \- Q1: {hawker_result['q1_cleaningstartdate']} to {hawker_result['q1_cleaningenddate']}\n"
        message += f"    \- Q2: {hawker_result['q2_cleaningstartdate']} to {hawker_result['q2_cleaningenddate']}\n"
        message += f"    \- Q3: {hawker_result['q3_cleaningstartdate']} to {hawker_result['q3_cleaningenddate']}\n"
        message += f"    \- Q4: {hawker_result['q4_cleaningstartdate']} to {hawker_result['q4_cleaningenddate']}\n"
        message += f"🛠 *Other Works Dates:*\n{hawker_result['other_works_startdate']} to {hawker_result['other_works_enddate']}\n"
        message += f"🗺 [Google Maps 3D]({hawker_result['google_3d_view']})\n"
        await update.message.reply_text(message, parse_mode="MarkdownV2")
    else:
        await update.message.reply_text(
            "Hawker not found, invalid serial number\?", parse_mode="MarkdownV2"
        )


async def handle_location(update, context):
    user_loc = update.message.location
    output_string = ""
    if user_loc:
        nearest_hawkers, last_modified_date = get_nearest_hawkers(
            user_lat=user_loc["latitude"],
            user_lon=user_loc["longitude"],
            num_hawkers=10,
        )
        output_string += "*Closest 10 Hawkers Near You*\n\n"
        for r in nearest_hawkers:
            output_string += f"*📍[{clean(r['name'])}]({clean(r['photourl'])}) \(\~{clean(str(round(r['distance'], 2)))}km\)*\n{r['address_myenv']}\n🍽 Stalls: {r['no_of_food_stalls']}   🐟 Stalls: {r['no_of_market_stalls']}\n🗺 {clean(r['google_3d_view'])}\n\n"

        output_string += f"_updated {clean(last_modified_date)[:12]}_"
        await update.message.reply_text(text=output_string, parse_mode="MarkdownV2")


def main() -> None:
    """Run the bot."""
    tele_env = dotenv_values(".env")
    TELEGRAM_API_KEY = tele_env.get("TELEGRAM_API_KEY")
    CHAT_ID = tele_env.get("CHAT_ID")

    application = Application.builder().token(TELEGRAM_API_KEY).build()

    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("nearest", nearest_hawkers))
    application.add_handler(CommandHandler("cleaning", cleaning_hawkers))
    application.add_handler(CommandHandler("otherworks", otherworks_hawkers))
    application.add_handler(CommandHandler("closedtoday", closed_hawkers_today))
    application.add_handler(CommandHandler("closedtomorrow", closed_hawkers_tomorrow))
    application.add_handler(CommandHandler("closedthisweek", closed_hawkers_this_week))
    application.add_handler(CommandHandler("hawkerinfo", hawker_info))
    application.add_handler(CommandHandler("search", search))

    application.add_handler(InlineQueryHandler(inline_query))
    application.add_handler(MessageHandler(filters.LOCATION, handle_location))

    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
