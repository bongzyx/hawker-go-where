import requests
import os
import json
import csv
from datetime import datetime, timedelta
from math import radians, sin, cos, acos


DATASET_ID = "d_bda4baa634dd1cc7a6c7cad5f19e2d68"
API_METADATA_URL = (
    f"https://api-production.data.gov.sg/v2/public/api/datasets/{DATASET_ID}/metadata"
)
GENERATE_DOWNLOAD_LINK_URL = f"https://api-production.data.gov.sg/v2/internal/api/datasets/{DATASET_ID}/initiate-download"

INVALID_DATES = ["TBC", "NA", "#N/A"]

current_mth = datetime.now().month
quarter = (
    1 if current_mth < 4 else 2 if current_mth < 7 else 3 if current_mth < 10 else 4
)


def fetch_data_from_api(last_modified_date=None):
    payload = {}
    headers = {"content-type": "application/json"}
    response = requests.post(GENERATE_DOWNLOAD_LINK_URL, json=payload, headers=headers)
    print(response.text)
    if response.status_code == 201:
        download_link = response.json()["data"]["url"]
        csv_file = requests.get(download_link)

        if csv_file.status_code == 200:
            csv_data = csv_file.content.decode("utf-8")
            csv_rows = list(csv.reader(csv_data.splitlines()))
            header = csv_rows[0]
            hawker_data = []
            for row in csv_rows[1:]:
                hawker_item = {}
                for i, value in enumerate(row):
                    hawker_item[header[i]] = value
                hawker_data.append(hawker_item)

            last_modified_date_obj = datetime.strptime(
                last_modified_date, "%Y-%m-%dT%H:%M:%S%z"
            ).date()
            last_modified_date_only_str = last_modified_date_obj.strftime("%Y_%m_%d")
            filename = f"./data/hawker_data_{last_modified_date_only_str}.json"
            json_data = {"last_modified": last_modified_date, "records": hawker_data}
            with open(filename, "w") as file:
                json.dump(json_data, file)
            with open("data/latest_data.json", "w") as file:
                json.dump(json_data, file)

            return hawker_data
    else:
        print("Failed to get download link URL.")
        return None


def is_data_update_required():
    if os.path.exists("data/latest_data.json"):
        with open("data/latest_data.json", "r") as latest_json:
            data = json.load(latest_json)
        last_modified_json_str = data["last_modified"]
        last_modified_json = datetime.strptime(
            last_modified_json_str, "%Y-%m-%dT%H:%M:%S%z"
        ).date()
    else:
        last_modified_json = datetime(1970, 1, 1).date()
    response = requests.get(API_METADATA_URL)
    if response.status_code == 200:
        last_modified_api_str = response.json()["data"]["lastUpdatedAt"]
        last_modified_api = datetime.strptime(
            last_modified_api_str, "%Y-%m-%dT%H:%M:%S%z"
        ).date()
        print(last_modified_api_str)
        if last_modified_api > last_modified_json:
            return last_modified_api_str
    return None


def parse_date(date_str):
    try:
        return datetime.strptime(date_str, "%d/%m/%Y").date()
    except ValueError:
        return datetime(1970, 1, 1).date()


def is_valid_date(date_str):
    return date_str not in INVALID_DATES


def is_date_within_range(start_date, end_date, target_date):
    return start_date <= target_date <= end_date


def filter_hawkers_by_status(status, from_date, target_date):
    with open("data/latest_data.json", "r") as latest_json:
        json_data = json.load(latest_json)

    records = json_data["records"]
    last_modified_date = json_data["last_modified"]

    filtered_hawkers = []
    if not target_date:
        from_date = datetime.now().date()
    if not target_date:
        target_date = datetime.now().date()
    for record in records:
        # process cleaning hawkers
        if status == "cleaning":
            for i in range(1, 5):
                cleaning_start_date_str = record.get(f"q{i}_cleaningstartdate")
                cleaning_end_date_str = record.get(f"q{i}_cleaningenddate")

                # print("cleaning", cleaning_start_date_str, cleaning_end_date_str, "\n")
                if is_valid_date(cleaning_start_date_str) and is_valid_date(
                    cleaning_end_date_str
                ):
                    cleaning_start_date = parse_date(cleaning_start_date_str)
                    cleaning_end_date = parse_date(cleaning_end_date_str)
                    if (
                        is_date_within_range(
                            cleaning_start_date, cleaning_end_date, from_date
                        )
                        or is_date_within_range(
                            cleaning_start_date, cleaning_end_date, target_date
                        )
                        or (
                            from_date <= cleaning_start_date
                            and cleaning_end_date <= target_date
                        )
                    ):
                        filtered_hawkers.append(record)

        # process other works hawkers
        elif status == "other_works":
            other_works_start_date_str = record.get("other_works_startdate")
            other_works_end_date_str = record.get("other_works_enddate")

            # print("others", other_works_start_date_str, other_works_end_date_str)
            if is_valid_date(other_works_start_date_str) and is_valid_date(
                other_works_end_date_str
            ):
                other_works_start_date = parse_date(other_works_start_date_str)
                other_works_end_date = parse_date(other_works_end_date_str)
                if (
                    is_date_within_range(
                        other_works_start_date, other_works_end_date, target_date
                    )
                    or is_date_within_range(
                        other_works_start_date, other_works_end_date, from_date
                    )
                    or (
                        from_date <= other_works_start_date
                        and other_works_end_date <= target_date
                    )
                ):
                    filtered_hawkers.append(record)

        if status == "cleaning":
            filtered_hawkers.sort(
                key=lambda x: parse_date(x.get(f"q{quarter}_cleaningstartdate"))
            )
        elif status == "other_works":
            filtered_hawkers.sort(
                key=lambda x: parse_date(x.get("other_works_startdate"))
            )
    return filtered_hawkers, last_modified_date


def search_hawker(query=None, serial_no=None):
    with open("data/latest_data.json", "r") as latest_json:
        json_data = json.load(latest_json)

    records = json_data["records"]
    last_modified_date = json_data["last_modified"]

    if query:
        return [hawker for hawker in records if query.lower() in hawker["name"].lower()]
    elif serial_no:
        return [
            hawker
            for hawker in records
            if serial_no.lower() == hawker["serial_no"].lower()
        ]


def get_current_cleaning():
    current_date = datetime.now().date()
    return filter_hawkers_by_status("cleaning", current_date, current_date)


def get_current_other_works():
    current_date = datetime.now().date()
    return filter_hawkers_by_status("other_works", current_date, current_date)


def get_upcoming_cleaning(num_days=7):
    current_date = datetime.now().date()
    end_date_limit = current_date + timedelta(days=num_days)
    return filter_hawkers_by_status("cleaning", current_date, end_date_limit)


def get_upcoming_other_works(num_days=30):
    current_date = datetime.now().date()
    end_date_limit = current_date + timedelta(days=num_days)
    return filter_hawkers_by_status("other_works", current_date, end_date_limit)


def get_closed_hawkers(from_date=None, target_date=None):
    current_date = datetime.now().date()
    if not from_date:
        from_date = current_date
    if not target_date:
        target_date = from_date
    cleaning_hawkers, last_modified_date = filter_hawkers_by_status(
        "cleaning", from_date, target_date
    )
    other_works_hawkers, _ = filter_hawkers_by_status(
        "other_works", from_date, target_date
    )
    return cleaning_hawkers, other_works_hawkers, last_modified_date


def get_nearest_hawkers(user_lat, user_lon, num_hawkers=5, max_distance=5.0):
    with open("data/latest_data.json", "r") as latest_json:
        json_data = json.load(latest_json)

    records = json_data["records"]
    last_modified_date = json_data["last_modified"]

    def calculate_distance(user_lat, user_lon, hawker_lat, hawker_lon):
        slat = radians(float(user_lat))
        slon = radians(float(user_lon))
        elat = radians(float(hawker_lat))
        elon = radians(float(hawker_lon))

        dist = 6371.01 * acos(
            sin(slat) * sin(elat) + cos(slat) * cos(elat) * cos(slon - elon)
        )
        return dist

    for hawker in records:
        hawker_lat = float(hawker["latitude_hc"])
        hawker_lon = float(hawker["longitude_hc"])
        hawker["distance"] = round(
            calculate_distance(user_lat, user_lon, hawker_lat, hawker_lon), 2
        )

    nearest_hawkers = [
        hawker for hawker in records if hawker["distance"] <= max_distance
    ]
    nearest_hawkers.sort(key=lambda hawker: hawker["distance"])

    return nearest_hawkers[:num_hawkers], last_modified_date


def main():
    current_cleaning, last_modified_date = get_current_cleaning()
    current_other_works, last_modified_date = get_current_other_works()
    upcoming_cleaning, last_modified_date = get_upcoming_cleaning(num_days=7)
    upcoming_other_works, last_modified_date = get_upcoming_other_works(num_days=30)

    print(f"Current Cleaning: {len(current_cleaning)} (updated {last_modified_date})")
    for record in current_cleaning:
        print(f"- {record['name']}")

    print(
        f"Current Other Works: {len(current_other_works)} (updated {last_modified_date})"
    )
    for record in current_other_works:
        print(f"- {record['name']}")

    print(f"Upcoming Cleaning: {len(upcoming_cleaning)} (updated {last_modified_date})")
    for record in upcoming_cleaning:
        print(f"- {record['name']}")

    print(
        f"Upcoming Other Works: {len(upcoming_other_works)} (updated {last_modified_date})"
    )
    for record in upcoming_other_works:
        print(f"- {record['name']}")

    # Get hawker centres closed today
    today = datetime.now().date()
    (
        closed_today_cleaning,
        closed_today_other_works,
        last_modified_date,
    ) = get_closed_hawkers(from_date=today, target_date=today)
    print(f"Closed Today: (updated {last_modified_date})")
    for record in closed_today_cleaning:
        print(f"- {record['name']} (Cleaning)")
    for record in closed_today_other_works:
        print(f"- {record['name']} (Other Works)")

    # Get hawker centres closed tomorrow
    tomorrow = today + timedelta(days=1)
    (
        closed_tomorrow_cleaning,
        closed_tomorrow_other_works,
        last_modified_date,
    ) = get_closed_hawkers(from_date=tomorrow, target_date=tomorrow)
    print(f"Closed Tomorrow: (updated {last_modified_date})")
    for record in closed_tomorrow_cleaning:
        print(f"- {record['name']} (Cleaning)")
    for record in closed_tomorrow_other_works:
        print(f"- {record['name']} (Other Works)")

    # Get hawker centres closed this week
    one_week_later = today + timedelta(weeks=1)
    (
        closed_this_week_cleaning,
        closed_this_week_other_works,
        last_modified_date,
    ) = get_closed_hawkers(from_date=today, target_date=one_week_later)
    print(f"Closed This Week: (updated {last_modified_date})")
    for record in closed_this_week_cleaning:
        print(f"- {record['name']} (Cleaning)")
    for record in closed_this_week_other_works:
        print(f"- {record['name']} (Other Works)")

    # Get nearest hawker centres
    nearest_hawkers, _ = get_nearest_hawkers(
        user_lat=1.3709616, user_lon=103.8363679, num_hawkers=5
    )
    print(f"Nearest Hawkers: {len(nearest_hawkers)}")
    for record in nearest_hawkers:
        print(f"- {record['name']} ({record['distance']}km)")


if __name__ == "__main__":
    update_required = is_data_update_required()
    if update_required:
        results = fetch_data_from_api(update_required)
        print(f"{len(results)} records found.")
    else:
        print("Data is up to date.")
    main()
