# AWS-based multimedia player

Currently supports dragging and dropping of music files. Video in progress, as well as a chat feature. 

## Adding music to the library

1. Drop files into public/media/music/ — folder structure is respected:
public/media/music/Radiohead/OK Computer/01 - Creep.mp3
2. Run npm run scan-library
3. Refresh the browser — tracks appear instantly

## Made an interactive 3d steam deck to watch videos on (in browser)

![Steam Deck Player](public/steamdeck-player-example.png)

## Example of Music Browser

![Music Browser](public/music-browser.png)

# Uploading Media

Music and video live under separate prefixes in the bucket — `music/` and `video/`.

$ aws s3 sync MUSIC/LOCATION/ s3://cahill-media-library/music/ --exclude ".*" --only-show-errors 2>&1 | tee ~/music-upload.log

aws s3 sync VIDEO/LOCATION/ s3://cahill-media-library/video/ --exclude ".*" --only-show-errors 2>&1 | tee ~/video-upload.log -->