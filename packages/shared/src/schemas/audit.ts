import { z } from "zod";

export const auditSessionStartSchema = z.object({
  locationId: z.string().min(1),
  // 하위 선반·박스까지 한 세션에서 볼지. 기본 true — 방 단위로 도는 경우가 많다.
  includeChildren: z.boolean().default(true),
});

export const auditScanSchema = z.object({
  barcodeValue: z.string().min(1),
});

export const auditConfirmSchema = z.object({
  itemId: z.string().min(1),
  // 현장에서 센 수량. ASSET는 서버가 1로 고정한다.
  actualQuantity: z.number().int().min(0),
  // 다른 위치에 있던 물건을 여기서 발견했을 때 세션 위치로 옮긴다.
  moveHere: z.boolean().default(false),
});

export const auditRegisterSchema = z.object({
  barcodeValue: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().int().min(0).default(1),
});

const auditUnscannedActionSchema = z.enum(["ZERO", "MOVE", "LEAVE"]);

export const auditFinishSchema = z
  .object({
    // 안 찍힌(PENDING) 아이템에 일괄 적용. 자동 삭제는 절대 없다.
    defaultAction: auditUnscannedActionSchema,
    moveToLocationId: z.string().min(1).optional(),
    exceptions: z
      .array(
        z.object({
          itemId: z.string().min(1),
          action: auditUnscannedActionSchema,
          moveToLocationId: z.string().min(1).optional(),
        }),
      )
      .default([]),
  })
  .superRefine((data, ctx) => {
    // 루프 도중 400이 나면 앞선 ZERO가 이미 커밋되는 사고를 스키마 단계에서도 막는다.
    // (핸들러는 buildFinishPlans로 한 번 더 검증한 뒤 단일 트랜잭션으로 적용한다.)
    if (data.defaultAction === "MOVE" && !data.moveToLocationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "moveToLocationId is required when action is MOVE",
        path: ["moveToLocationId"],
      });
    }
    data.exceptions.forEach((ex, i) => {
      if (ex.action === "MOVE" && !(ex.moveToLocationId ?? data.moveToLocationId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "moveToLocationId is required when action is MOVE",
          path: ["exceptions", i, "moveToLocationId"],
        });
      }
    });
  });

export type AuditUnscannedAction = z.infer<typeof auditUnscannedActionSchema>;
