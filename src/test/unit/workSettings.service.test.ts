// Unit tests for workSettings service — pure logic (isWorkingDay, isHoliday, countWorkingDays).
// Supabase client and the Zustand dataStore are mocked so no I/O happens.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock supabase client ─────────────────────────────────────────────────────
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnThis(),
    }),
  },
}));

// ─── Mock authStore ───────────────────────────────────────────────────────────
vi.mock("@/store/authStore", () => ({
  useAuthStore: {
    getState: () => ({ user: { id: "u_admin" } }),
  },
}));

// ─── Mock logService ──────────────────────────────────────────────────────────
vi.mock("@/services/log.service", () => ({
  logService: { append: vi.fn() },
}));

// ─── Controlled dataStore mock ────────────────────────────────────────────────
const storeMock = {
  workSettings: {
    workingDays: [1, 2, 3, 4, 5], // Mon-Fri
    holidays: [] as { date: string; label: string }[],
  },
  autoBackupSettings: {
    enabled: false,
    email: "",
    time: "22:00",
    lastAutoBackupDate: null,
  },
  setWorkSettings: vi.fn((v) => {
    storeMock.workSettings = v;
  }),
  setAutoBackupSettings: vi.fn(),
};

vi.mock("@/store/dataStore", () => ({
  useDataStore: { getState: () => storeMock },
}));

// ─── Now import the service (after mocks) ─────────────────────────────────────
import { workSettingsService } from "@/services/workSettings.service";

beforeEach(() => {
  // Reset to default Mon-Fri, no holidays
  storeMock.workSettings = {
    workingDays: [1, 2, 3, 4, 5],
    holidays: [],
  };
  vi.clearAllMocks();
});

// ─── isWorkingDay ─────────────────────────────────────────────────────────────
describe("workSettingsService.isWorkingDay", () => {
  it("should return true for Monday (workingDays includes 1)", () => {
    // 2026-05-18 is a Monday
    expect(workSettingsService.isWorkingDay("2026-05-18")).toBe(true);
  });

  it("should return true for Friday", () => {
    // 2026-05-22 is a Friday
    expect(workSettingsService.isWorkingDay("2026-05-22")).toBe(true);
  });

  it("should return false for Saturday (6 not in [1,2,3,4,5])", () => {
    // 2026-05-23 is a Saturday
    expect(workSettingsService.isWorkingDay("2026-05-23")).toBe(false);
  });

  it("should return false for Sunday", () => {
    // 2026-05-24 is a Sunday
    expect(workSettingsService.isWorkingDay("2026-05-24")).toBe(false);
  });

  it("should return false for a date that falls on a working day but is a holiday", () => {
    storeMock.workSettings.holidays = [{ date: "2026-05-18", label: "Test Holiday" }];
    expect(workSettingsService.isWorkingDay("2026-05-18")).toBe(false);
  });

  it("should return true on Monday when unrelated holidays are set", () => {
    storeMock.workSettings.holidays = [{ date: "2026-12-25", label: "Christmas" }];
    expect(workSettingsService.isWorkingDay("2026-05-18")).toBe(true);
  });

  it("should return false when workingDays is empty", () => {
    storeMock.workSettings.workingDays = [];
    expect(workSettingsService.isWorkingDay("2026-05-18")).toBe(false);
  });

  it("should handle Sunday = 0 correctly", () => {
    storeMock.workSettings.workingDays = [0, 6]; // Weekend workers
    expect(workSettingsService.isWorkingDay("2026-05-24")).toBe(true); // Sunday
    expect(workSettingsService.isWorkingDay("2026-05-23")).toBe(true); // Saturday
    expect(workSettingsService.isWorkingDay("2026-05-18")).toBe(false); // Monday (1 not in [0,6])
  });
});

// ─── isHoliday ────────────────────────────────────────────────────────────────
describe("workSettingsService.isHoliday", () => {
  it("should return false when no holidays are set", () => {
    expect(workSettingsService.isHoliday("2026-12-25")).toBe(false);
  });

  it("should return true when the date is in the holidays list", () => {
    storeMock.workSettings.holidays = [{ date: "2026-12-25", label: "Christmas" }];
    expect(workSettingsService.isHoliday("2026-12-25")).toBe(true);
  });

  it("should return false for a date not in the holidays list", () => {
    storeMock.workSettings.holidays = [{ date: "2026-12-25", label: "Christmas" }];
    expect(workSettingsService.isHoliday("2026-12-26")).toBe(false);
  });
});

// ─── countWorkingDays ─────────────────────────────────────────────────────────
describe("workSettingsService.countWorkingDays", () => {
  it("should count 5 working days in a full Mon-Fri week", () => {
    const from = new Date("2026-05-18"); // Mon
    const to = new Date("2026-05-24");   // Sun
    expect(workSettingsService.countWorkingDays(from, to)).toBe(5);
  });

  it("should count 0 for a weekend-only range", () => {
    const from = new Date("2026-05-23"); // Sat
    const to = new Date("2026-05-24");   // Sun
    expect(workSettingsService.countWorkingDays(from, to)).toBe(0);
  });

  it("should count 1 for a single working day", () => {
    const from = new Date("2026-05-18");
    const to = new Date("2026-05-18");
    expect(workSettingsService.countWorkingDays(from, to)).toBe(1);
  });

  it("should subtract holidays that fall on working days", () => {
    storeMock.workSettings.holidays = [{ date: "2026-05-18", label: "Test Holiday" }];
    const from = new Date("2026-05-18"); // Mon (holiday)
    const to = new Date("2026-05-22");   // Fri
    // 5 working days - 1 holiday = 4
    expect(workSettingsService.countWorkingDays(from, to)).toBe(4);
  });

  it("should count 10 working days in 2 full working weeks", () => {
    const from = new Date("2026-05-18"); // Mon
    const to = new Date("2026-05-29");   // Fri
    expect(workSettingsService.countWorkingDays(from, to)).toBe(10);
  });

  it("should return 0 when from > to", () => {
    const from = new Date("2026-05-22");
    const to = new Date("2026-05-18");
    expect(workSettingsService.countWorkingDays(from, to)).toBe(0);
  });
});

// ─── addHoliday ───────────────────────────────────────────────────────────────
describe("workSettingsService.addHoliday", () => {
  it("should add a holiday to the local store", () => {
    workSettingsService.addHoliday("2026-12-25", "Christmas");
    expect(storeMock.setWorkSettings).toHaveBeenCalled();
    const updated = storeMock.setWorkSettings.mock.calls[0][0];
    expect(updated.holidays).toContainEqual({ date: "2026-12-25", label: "Christmas" });
  });

  it("should not add a duplicate holiday", () => {
    storeMock.workSettings.holidays = [{ date: "2026-12-25", label: "Christmas" }];
    workSettingsService.addHoliday("2026-12-25", "Christmas Again");
    expect(storeMock.setWorkSettings).not.toHaveBeenCalled();
  });

  it("should sort holidays by date after adding", () => {
    storeMock.workSettings.holidays = [{ date: "2026-12-31", label: "NYE" }];
    workSettingsService.addHoliday("2026-12-25", "Christmas");
    const updated = storeMock.setWorkSettings.mock.calls[0][0];
    expect(updated.holidays[0].date).toBe("2026-12-25");
    expect(updated.holidays[1].date).toBe("2026-12-31");
  });

  it("should append an audit log entry", async () => {
    const { logService } = await import("@/services/log.service");
    workSettingsService.addHoliday("2026-11-11", "Veterans Day");
    expect(logService.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "settings.holiday_add" })
    );
  });
});

// ─── removeHoliday ────────────────────────────────────────────────────────────
describe("workSettingsService.removeHoliday", () => {
  it("should remove a holiday from the local store", () => {
    storeMock.workSettings.holidays = [
      { date: "2026-12-25", label: "Christmas" },
      { date: "2026-12-31", label: "NYE" },
    ];
    workSettingsService.removeHoliday("2026-12-25");
    const updated = storeMock.setWorkSettings.mock.calls[0][0];
    expect(updated.holidays).toHaveLength(1);
    expect(updated.holidays[0].date).toBe("2026-12-31");
  });

  it("should append an audit log entry", async () => {
    storeMock.workSettings.holidays = [{ date: "2026-12-25", label: "Christmas" }];
    const { logService } = await import("@/services/log.service");
    workSettingsService.removeHoliday("2026-12-25");
    expect(logService.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "settings.holiday_remove" })
    );
  });
});
