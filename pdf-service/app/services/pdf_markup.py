import fitz  # PyMuPDF
from typing import List, Dict, Any

STATUS_COLORS = {
    "PASS": {
        "border": (16/255, 185/255, 129/255),    # #10B981 Emerald
        "fill": (209/255, 250/255, 229/255),    # #D1FAE5 Light Green
        "text": (6/255, 95/255, 70/255)         # #065F46 Dark Green
    },
    "CHECK": {
        "border": (245/255, 158/255, 11/255),   # #F59E0B Amber
        "fill": (254/255, 243/255, 199/255),    # #FEF3C7 Light Amber
        "text": (146/255, 64/255, 14/255)       # #92400E Dark Amber
    },
    "FAIL": {
        "border": (239/255, 68/255, 68/255),    # #EF4444 Red
        "fill": (254/255, 226/255, 226/255),    # #FEE2E2 Light Red
        "text": (153/255, 27/255, 27/255)       # #991B1B Dark Red
    },
    "PENDING": {
        "border": (59/255, 130/255, 246/255),   # #3B82F6 Blue
        "fill": (219/255, 234/255, 254/255),    # #DBEAFE Light Blue
        "text": (30/255, 64/255, 175/255)       # #1E40AF Dark Blue
    }
}

def generate_marked_up_pdf(input_pdf_path: str, output_pdf_path: str, balloons: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Renders balloons and leader lines onto a new output PDF using PyMuPDF.
    Leaves original PDF untouched.
    """
    try:
        doc = fitz.open(input_pdf_path)

        for b in balloons:
            page_num = b.get("pageNumber", 1) - 1
            if page_num < 0 or page_num >= len(doc):
                continue

            page = doc[page_num]
            rect = page.rect
            pw, ph = rect.width, rect.height

            # Coordinates are normalized [0..1]
            x = b.get("x", 0.5) * pw
            y = b.get("y", 0.5) * ph
            
            status = b.get("status", "PENDING").upper()
            if status not in STATUS_COLORS:
                status = "PENDING"
            color = STATUS_COLORS[status]

            balloon_num = str(b.get("balloonNumber", 1))
            radius = b.get("radius", 14)  # Default radius in PDF points

            # Draw Leader Line if start point exists
            leader_start_x = b.get("leaderStartX")
            leader_start_y = b.get("leaderStartY")
            if leader_start_x is not None and leader_start_y is not None:
                lx = leader_start_x * pw
                ly = leader_start_y * ph
                shape = page.new_shape()
                shape.draw_line(fitz.Point(lx, ly), fitz.Point(x, y))
                shape.finish(color=color["border"], width=1.5, stroke_opacity=0.8)
                shape.commit()

            # Draw Circle Balloon
            shape = page.new_shape()
            balloon_center = fitz.Point(x, y)
            shape.draw_circle(balloon_center, radius)
            shape.finish(
                color=color["border"],
                fill=color["fill"],
                width=1.8,
                fill_opacity=0.9
            )
            shape.commit()

            # Insert Text (Balloon Number) centered
            # Use small font size depending on digits count
            font_size = 11 if len(balloon_num) <= 2 else 9
            text_rect = fitz.Rect(x - radius, y - radius, x + radius, y + radius)
            page.insert_textbox(
                text_rect,
                balloon_num,
                fontsize=font_size,
                fontname="helv",
                color=color["text"],
                align=fitz.TEXT_ALIGN_CENTER
            )

        doc.save(output_pdf_path)
        doc.close()
        return {
            "success": True,
            "outputPath": output_pdf_path,
            "totalBalloons": len(balloons)
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }
