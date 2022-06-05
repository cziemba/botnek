#!/usr/bin/env zsh

set -u

while getopts i:o:s: flag
do
    case "${flag}" in
        i) inputJson=${OPTARG};;
        o) outputJson=${OPTARG};;
        s) saveAudioDir=${OPTARG};;
    esac
done

if ! command -v jq &> /dev/null
then
  echo "Install jq!"
  exit 1
fi

if ! command -v ffmpeg &> /dev/null
then
  echo "Install ffmpeg!"
  exit 1
fi

echo "processing $inputJson"
echo "writing to $outputJson"
echo "cloning sfx to $saveAudioDir"

# json is <some id>."GUILD".<guild id>."sounds".<alias, filepath>
# Read all files from inputJson
# For each file:
#    ffmpeg silenceremove
#    write to outputDir (botnek/sounds/guild-id/filename.mp3) with downcased,whitespace-stripped,guid-appended filename.
#    check current sfx-db, if alias is taken, print error and skip
#    Add it to the sfx-db (json?)
output=()
while IFS="," read -r key value; do
  outFile="$saveAudioDir$(basename "$value" | sed -e 's/.mp3//' | tr '[:upper:]' '[:lower:]' | sed -e 's/[^a-z0-9]//g').mp3"
  pathEscaped=${value//\"/}
  ls -l "$pathEscaped"
  ffmpeg -nostdin -y -i "$pathEscaped" -af silenceremove=start_periods=1:start_silence=0.1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_silence=0.1:start_threshold=-50dB,areverse "${outFile}"
  output+=("$key: \"$outFile\",")
done < <(cat "$inputJson" | jq -r '."134621854878007296".GUILD."300748021300330497".sounds | to_entries[] | [.key, .value] | @csv')

for value in "${output[@]}"; do
  echo "$value"
done