from distutils.log import info
import requests, json
from datetime import date, datetime
from math import radians, sin, cos, acos


current_mth = datetime.now().month
quarter = (
    1 if current_mth < 4 else 2 if current_mth < 7 else 3 if current_mth < 10 else 4
)
invalid_dates = ["TBC", "NA", "#N/A"]


def calc_distance(p1, p2):
    slat = radians(float(p1["latitude"]))
    slon = radians(float(p1["longitude"]))
    elat = radians(float(p2["latitude"]))
    elon = radians(float(p2["longitude"]))

    dist = 6371.01 * acos(
        sin(slat) * sin(elat) + cos(slat) * cos(elat) * cos(slon - elon)
    )
    return dist


def get_last_modified_date():
    params = {
        "id": "b80cb643-a732-480d-86b5-e03957bc82aa",
    }

    info_res = requests.get(
        "https://data.gov.sg/api/action/resource_show", params=params
    )
    info_res = json.loads(info_res.text)
    return datetime.fromisoformat(info_res["result"]["last_modified"])


def get_all_hawkers():
    params = {"resource_id": "b80cb643-a732-480d-86b5-e03957bc82aa", "limit": 999}

    info_res = requests.get(
        "https://data.gov.sg/api/action/datastore_search", params=params
    )
    info_res = json.loads(info_res.text)
    return info_res["result"]["records"]


def get_all_cleaning():
    global all_hawkers

    def date_key(val):
        return (
            datetime(1970, 1, 1)
            if val.get(f"q{quarter}_cleaningstartdate") in invalid_dates
            else datetime.strptime(val.get(f"q{quarter}_cleaningstartdate"), "%d/%m/%Y")
        )

    sorted_hawkers = sorted(all_hawkers, key=date_key)
    filtered_hawkers = []
    for h in sorted_hawkers:
        if h.get(f"q{quarter}_cleaningstartdate") not in invalid_dates:
            if datetime.strptime(
                h.get(f"q{quarter}_cleaningenddate"), "%d/%m/%Y"
            ) >= datetime.now().replace(hour=0, minute=0, second=0, microsecond=0):
                # print(h["name"])
                # print(f'  - {h["address_myenv"]}')
                # print(
                #     f'  - {h[f"q{quarter}_cleaningstartdate"]} to {h[f"q{quarter}_cleaningenddate"]}'
                # )
                # print(f'  - {h[f"remarks_q{quarter}"]}')
                filtered_hawkers.append(h)
    return filtered_hawkers, last_modified_date, quarter


def get_all_other_works():
    global all_hawkers

    def date_key(val):
        if val.get("other_works_startdate") in invalid_dates:
            return datetime(1970, 1, 1)
        else:
            return datetime.strptime(val.get("other_works_startdate"), "%d/%m/%Y")

    sorted_hawkers = sorted(all_hawkers, key=date_key)
    filtered_hawkers = []
    for h in sorted_hawkers:
        if h.get("other_works_startdate") not in invalid_dates:
            if datetime.strptime(
                h.get("other_works_enddate"), "%d/%m/%Y"
            ) >= datetime.now().replace(hour=0, minute=0, second=0, microsecond=0):
                filtered_hawkers.append(h)
                # print(h["name"])
                # print(f'  - {h["address_myenv"]}')
                # print(f'  - {h["other_works_startdate"]} to {h["other_works_enddate"]}')
                # print(f'  - {h[f"remarks_other_works"]}')
    return filtered_hawkers, last_modified_date


def get_nearest_hawkers(current_location):
    global all_hawkers
    list_of_hawkers = []
    for h in all_hawkers:
        hc_loc = [h.get("latitude_hc"), h.get("longitude_hc")]
        dist = calc_distance(
            current_location,
            {"latitude": hc_loc[0], "longitude": hc_loc[1]},
        )
        h["relativeDistance"] = dist
        list_of_hawkers.append(h)
        # print(f"{str(round(h['relativeDistance'], 2))}km - {h['address_myenv']}")

    def get_distance(val):
        return float(val.get("relativeDistance"))

    list_of_hawkers.sort(key=get_distance)
    all_cleaning, _, _ = get_all_cleaning()
    all_works, _ = get_all_other_works()
    closed_cleaning = []
    closed_other_works = []
    all_open = []
    for hawker in list_of_hawkers:
        for c in all_cleaning:
            if hawker["serial_no"] in c["serial_no"]:
                closed_cleaning.append(hawker)
                break
        else:
            for w in all_works:
                if hawker["serial_no"] in w["serial_no"]:
                    closed_other_works.append(hawker)
                    break
            else:
                all_open.append(hawker)

    # for h in list_of_hawkers:
    #     print(f"{str(round(h['relativeDistance'], 2))}km - {h['address_myenv']}")
    return all_open, closed_cleaning, closed_other_works, last_modified_date


last_modified_date = datetime.strftime(get_last_modified_date(), "%d/%m/%Y")
all_hawkers = get_all_hawkers()


def update():
    global last_modified_date
    global all_hawkers
    last_modified_date = datetime.strftime(get_last_modified_date(), "%d/%m/%Y")
    all_hawkers = get_all_hawkers()
    return last_modified_date


if __name__ == "__main__":
    last_modified_date = get_last_modified_date()
    all_hawkers = get_all_hawkers()
    print(all_hawkers)
    print(get_all_cleaning()[0])
    (
        all_open,
        closed_cleaning,
        closed_other_works,
        last_modified_date,
    ) = get_nearest_hawkers({"longitude": 103.851959, "latitude": 1.290270})
    print(all_open, closed_cleaning, closed_other_works, last_modified_date)
    get_all_other_works()
