import cv2
from ultralytics import YOLO

class HeadCountEngine:
    def __init__(self):
        self.model = YOLO('yolov8n.pt')

    def analyze_video(self, video_path):
        cap = cv2.VideoCapture(video_path)
        max_people = 0
        frame_index = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_index % 5 == 0:
                result = self.model(frame, classes=[0], verbose=False)
                count = len(result[0].boxes)
                max_people = max(max_people, count)
            frame_index += 1
        cap.release()
        return {'people': max_people}

head_count_engine = HeadCountEngine()
