// app/components/ScoreBadge.tsx

// ScoreBadge component to display a score with a background color based on the score's color
export default function ScoreBadge({ score, color }: any) {
    const bg =
        color === "green"
            ? "lightgreen"
            : color === "yellow"
                ? "khaki"
                : "lightcoral"

    // Container for the score badge with styling and background color based on the score's color
    return (
        <div style={{ background: bg, padding: 6, display: "inline-block" }}>
            {score} ({color})
        </div>
    )
}
