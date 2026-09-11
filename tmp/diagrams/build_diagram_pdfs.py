from pathlib import Path
import json
import shutil

import fitz
from PIL import Image, ImageOps, ImageDraw


ROOT = Path(r"D:\ISP\Lab-Data-Management")
MEDIA = ROOT / "tmp" / "diagrams" / "word" / "media"
PDF_OUT = ROOT / "output" / "pdf"
JSON_OUT = ROOT / "output" / "json"
RENDER_OUT = ROOT / "tmp" / "pdfs"
PAIR_OUT = ROOT / "output" / "diagram_exports"


ACTIVITY_IMAGES = [
    "image18.png", "image7.png", "image10.png",
    "image8.png", "image14.png", "image6.png",
]

SEQUENCE_IMAGES = [
    "image1.png", "image20.png", "image4.png", "image17.png",
    "image21.png", "image3.png", "image15.png", "image22.png",
    "image19.png", "image13.png", "image5.png", "image2.png",
    "image9.png", "image11.png",
]


def fit_rect(image_path: Path, box: fitz.Rect) -> fitz.Rect:
    with Image.open(image_path) as image:
        width, height = image.size
    scale = min(box.width / width, box.height / height)
    out_width = width * scale
    out_height = height * scale
    x0 = box.x0 + (box.width - out_width) / 2
    y0 = box.y0 + (box.height - out_height) / 2
    return fitz.Rect(x0, y0, x0 + out_width, y0 + out_height)


def text_size(text: str, max_width: float, initial: float, fontname: str) -> float:
    size = initial
    while size > 10 and fitz.get_text_length(text, fontname=fontname, fontsize=size) > max_width:
        size -= 0.5
    return size


def create_activity_pdf(json_path: Path, output_path: Path) -> None:
    data = json.loads(json_path.read_text(encoding="utf-8"))
    document = fitz.open()
    toc = []
    page_rect = fitz.paper_rect("a4")
    for index, (diagram, image_name) in enumerate(zip(data["diagrams"], ACTIVITY_IMAGES), 1):
        page = document.new_page(width=page_rect.width, height=page_rect.height)
        page.draw_rect(page.rect, color=None, fill=(1, 1, 1))
        title = f'{diagram["id"]}: {diagram["title"]}'
        trace = "Traced requirements: " + ", ".join(diagram["tracedRequirements"])
        title_font_size = text_size(title, page.rect.width - 64, 18, "hebo")
        page.insert_text((32, 36), title, fontsize=title_font_size, fontname="hebo", color=(0, 0, 0))
        page.insert_text((32, 58), trace, fontsize=9.5, fontname="helv", color=(0.25, 0.25, 0.25))
        page.draw_line((32, 68), (page.rect.width - 32, 68), color=(0.75, 0.75, 0.75), width=0.6)
        box = fitz.Rect(28, 78, page.rect.width - 28, page.rect.height - 24)
        image_path = MEDIA / image_name
        page.insert_image(fit_rect(image_path, box), filename=str(image_path), keep_proportion=True)
        toc.append([1, title, index])
    document.set_toc(toc)
    document.set_metadata({
        "title": "Section 7 - Activity Diagrams",
        "author": "Extracted from ISP-SKE-26 3 (3).docx",
        "subject": "Activity diagrams AD-1 through AD-6",
    })
    document.save(output_path, garbage=4, deflate=True)
    document.close()


def create_sequence_pdf(json_path: Path, output_path: Path) -> None:
    data = json.loads(json_path.read_text(encoding="utf-8"))
    document = fitz.open()
    toc = []
    page_rect = fitz.paper_rect("a3-l")
    for index, (diagram, image_name) in enumerate(zip(data["diagrams"], SEQUENCE_IMAGES), 1):
        page = document.new_page(width=page_rect.width, height=page_rect.height)
        page.draw_rect(page.rect, color=None, fill=(1, 1, 1))
        image_path = MEDIA / image_name
        box = fitz.Rect(18, 18, page.rect.width - 18, page.rect.height - 18)
        page.insert_image(fit_rect(image_path, box), filename=str(image_path), keep_proportion=True)
        toc.append([1, f'{diagram["id"]}: {diagram["title"]}', index])
    document.set_toc(toc)
    document.set_metadata({
        "title": "Section 12 - Sequence Diagrams",
        "author": "Extracted from ISP-SKE-26 3 (3).docx",
        "subject": "Sequence diagrams SQD-1 through SQD-14",
    })
    document.save(output_path, garbage=4, deflate=True)
    document.close()


def render_pdf(pdf_path: Path, output_dir: Path) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    rendered = []
    document = fitz.open(pdf_path)
    for index, page in enumerate(document, 1):
        pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
        target = output_dir / f"page-{index:02d}.png"
        pix.save(target)
        rendered.append(target)
    document.close()
    return rendered


def contact_sheet(images: list[Path], output_path: Path, columns: int, thumb_size: tuple[int, int]) -> None:
    rows = (len(images) + columns - 1) // columns
    gap = 20
    label_height = 34
    sheet = Image.new(
        "RGB",
        (columns * thumb_size[0] + (columns + 1) * gap,
         rows * (thumb_size[1] + label_height) + (rows + 1) * gap),
        "#d9d9d9",
    )
    draw = ImageDraw.Draw(sheet)
    for idx, path in enumerate(images):
        with Image.open(path).convert("RGB") as image:
            thumb = ImageOps.contain(image, thumb_size)
        x = gap + (idx % columns) * (thumb_size[0] + gap)
        y = gap + (idx // columns) * (thumb_size[1] + label_height + gap)
        px = x + (thumb_size[0] - thumb.width) // 2
        py = y + label_height + (thumb_size[1] - thumb.height) // 2
        sheet.paste(thumb, (px, py))
        draw.text((x + 4, y + 5), f"Page {idx + 1}", fill="black")
    sheet.save(output_path)


def split_section_exports(json_path: Path, combined_pdf: Path, section_dir: Path) -> None:
    data = json.loads(json_path.read_text(encoding="utf-8"))
    section_dir.mkdir(parents=True, exist_ok=True)
    source_pdf = fitz.open(combined_pdf)
    for index, diagram in enumerate(data["diagrams"]):
        diagram_id = diagram["id"]
        pdf_name = f"{diagram_id}.pdf"
        json_name = f"{diagram_id}.export.json"

        one_page = fitz.open()
        one_page.insert_pdf(source_pdf, from_page=index, to_page=index)
        one_page.set_metadata({
            "title": f'{diagram_id}: {diagram["title"]}',
            "author": "Extracted from ISP-SKE-26 3 (3).docx",
        })
        one_page.save(section_dir / pdf_name, garbage=4, deflate=True)
        one_page.close()

        individual = {
            "format": data["format"],
            "version": data["version"],
            "sourceDocument": data["sourceDocument"],
            "section": dict(data["section"]),
            "diagrams": [dict(diagram)],
        }
        individual["section"]["pdfFile"] = pdf_name
        individual["diagrams"][0]["pdfPage"] = 1
        (section_dir / json_name).write_text(
            json.dumps(individual, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
    source_pdf.close()

    archive_base = PDF_OUT.parent / section_dir.name
    archive_path = archive_base.with_suffix(".zip")
    if archive_path.exists():
        archive_path.unlink()
    shutil.make_archive(str(archive_base), "zip", root_dir=section_dir)


def main() -> None:
    PDF_OUT.mkdir(parents=True, exist_ok=True)
    activity_pdf = PDF_OUT / "section-07-activity-diagrams.pdf"
    sequence_pdf = PDF_OUT / "section-12-sequence-diagrams.pdf"
    create_activity_pdf(JSON_OUT / "section-07-activity-diagrams.export.json", activity_pdf)
    create_sequence_pdf(JSON_OUT / "section-12-sequence-diagrams.export.json", sequence_pdf)
    split_section_exports(
        JSON_OUT / "section-07-activity-diagrams.export.json",
        activity_pdf,
        PAIR_OUT / "section-07",
    )
    split_section_exports(
        JSON_OUT / "section-12-sequence-diagrams.export.json",
        sequence_pdf,
        PAIR_OUT / "section-12",
    )

    activity_pages = render_pdf(activity_pdf, RENDER_OUT / "section-07")
    sequence_pages = render_pdf(sequence_pdf, RENDER_OUT / "section-12")
    contact_sheet(activity_pages, RENDER_OUT / "section-07-contact.png", 2, (620, 880))
    contact_sheet(sequence_pages[:7], RENDER_OUT / "section-12-contact-a.png", 2, (900, 635))
    contact_sheet(sequence_pages[7:], RENDER_OUT / "section-12-contact-b.png", 2, (900, 635))


if __name__ == "__main__":
    main()
