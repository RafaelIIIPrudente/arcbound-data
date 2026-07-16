import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RecentPost } from "@/services/types";

const HEAD = "font-mono text-[10px] tracking-[0.12em] uppercase";

export function RecentPostsTable({ posts, postCount }: { posts: RecentPost[]; postCount: number }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
          <span className="text-primary">—</span>
          Recent posts
        </div>
        <div className="font-mono text-[11px] text-muted-foreground">
          {postCount.toLocaleString()} posts
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={HEAD}>Post</TableHead>
            <TableHead className={HEAD}>Date</TableHead>
            <TableHead className={HEAD}>Type</TableHead>
            <TableHead className={`${HEAD} text-right`}>Impr.</TableHead>
            <TableHead className={`${HEAD} text-right`}>Likes</TableHead>
            <TableHead className={`${HEAD} text-right`}>Comm.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {posts.map((post) => (
            <TableRow key={post.id}>
              <TableCell className="max-w-[380px] truncate text-sm">{post.snippet}</TableCell>
              <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                {post.date}
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className="font-mono text-[9.5px] tracking-[0.08em] text-muted-foreground uppercase"
                >
                  {post.format}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono text-sm tabular-nums">
                {post.impressions.toLocaleString()}
              </TableCell>
              <TableCell className="text-right font-mono text-sm text-muted-foreground tabular-nums">
                {post.likes.toLocaleString()}
              </TableCell>
              <TableCell className="text-right font-mono text-sm text-muted-foreground tabular-nums">
                {post.comments.toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
