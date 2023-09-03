import os, sys
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from hawker_api import is_data_update_required, fetch_data_from_api
import json

def generate_changelog():
    script_directory = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_directory)

    matching_files = [filename for filename in os.listdir('../data') if filename.startswith("hawker_data_") and filename.endswith(".json")]
    sorted_files = sorted(matching_files, reverse=True)

    if len(sorted_files) > 1:
        changelog = []

        with open(f'../data/{sorted_files[1]}', 'r') as file1, open(f'../data/{sorted_files[0]}', 'r') as file2:
            prev_data = json.load(file1)
            new_data = json.load(file2)

        prev_data_records = prev_data.get('records', '')
        new_data_records = new_data.get('records', '')
        prev_data_date = prev_data.get('last_modified', '')
        new_data_date = new_data.get('last_modified', '')

        changelog.append(f"## {new_data_date[:10]}\n")

        for entry_id, prev_entry in enumerate(prev_data_records):
            new_entry = next((entry for entry in new_data_records if entry["serial_no"] == prev_entry["serial_no"]), None)

            if new_entry is None:
                # check for removed entries
                changelog.append(f"❌ **Removed**: {prev_entry['serial_no']} - {prev_entry['name']}")
            else:
                # compare keys
                diff = []
                for key in prev_entry.keys():
                    if prev_entry[key] != new_entry[key]:
                        diff.append(f"  - {key}: `{prev_entry[key]}` -> `{new_entry[key]}`")
                
                if diff:
                    changelog.append(f"🔵 **Changed**: {entry_id + 1} {new_entry['name']}:\n" + "\n".join(diff))

        # check for added entries
        for new_entry in new_data_records:
            prev_entry = next((entry for entry in prev_data_records if entry["serial_no"] == new_entry["serial_no"]), None)
            if prev_entry is None:
                changelog.append(f"➕ **Added**: {new_entry['serial_no']} - {new_entry['name']}")

        # Read current changelog.md
        with open('../changelog.md', 'r') as changelog_file:
            existing_changelog = changelog_file.read()

        # Prepend new entries at the top
        with open('../changelog.md', 'w') as changelog_file:
            changelog_file.write("\n\n".join(changelog))
            changelog_file.write("\n\n" + existing_changelog)

update_required = is_data_update_required()
if update_required:
    results = fetch_data_from_api(update_required)
    print(f"Latest modified date: {update_required}")
    print(f"{len(results)} records found.")
    generate_changelog()
else:
    print("Data is up to date.")
