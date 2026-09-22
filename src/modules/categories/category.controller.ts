import type {
  NextFunction,
  Response,
} from "express";

import {
  categoryIdSchema,
  createCategorySchema,
  updateCategorySchema,
} from "./category.validation";

import {
  createCategory,
  getCategories,
  getCategoryById,
  setCategoryStatus,
  updateCategory,
} from "./category.service";

import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

function serializeBigInt<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_key, value) =>
      typeof value === "bigint"
        ? value.toString()
        : value
    )
  );
}

export async function createCategoryController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const data = createCategorySchema.parse(req.body);

    const category = await createCategory(
      req.user!.businessId,
      data
    );

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: serializeBigInt(category),
    });
  } catch (error) {
    next(error);
  }
}

export async function listCategoriesController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : undefined;

    const includeInactive =
      req.query.includeInactive === "true";

    const categories = await getCategories(
      req.user!.businessId,
      search,
      includeInactive
    );

    res.status(200).json({
      success: true,
      count: categories.length,
      data: serializeBigInt(categories),
    });
  } catch (error) {
    next(error);
  }
}

export async function getCategoryController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = categoryIdSchema.parse(req.params);

    const category = await getCategoryById(
      req.user!.businessId,
      id
    );

    if (!category) {
      res.status(404).json({
        success: false,
        message: "Category not found",
      });

      return;
    }

    res.status(200).json({
      success: true,
      data: serializeBigInt(category),
    });
  } catch (error) {
    next(error);
  }
}

export async function updateCategoryController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = categoryIdSchema.parse(req.params);

    const data = updateCategorySchema.parse(req.body);

    const result = await updateCategory(
      req.user!.businessId,
      id,
      data
    );

    if (result.count === 0) {
      res.status(404).json({
        success: false,
        message: "Category not found",
      });

      return;
    }

    const category = await getCategoryById(
      req.user!.businessId,
      id
    );

    res.status(200).json({
      success: true,
      message: "Category updated successfully",
      data: serializeBigInt(category),
    });
  } catch (error) {
    next(error);
  }
}

export async function deactivateCategoryController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = categoryIdSchema.parse(req.params);

    const result = await setCategoryStatus(
      req.user!.businessId,
      id,
      false
    );

    if (result.count === 0) {
      res.status(404).json({
        success: false,
        message: "Category not found",
      });

      return;
    }

    res.status(200).json({
      success: true,
      message: "Category deactivated successfully",
    });
  } catch (error) {
    next(error);
  }
}

export async function activateCategoryController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = categoryIdSchema.parse(req.params);

    const result = await setCategoryStatus(
      req.user!.businessId,
      id,
      true
    );

    if (result.count === 0) {
      res.status(404).json({
        success: false,
        message: "Category not found",
      });

      return;
    }

    res.status(200).json({
      success: true,
      message: "Category activated successfully",
    });
  } catch (error) {
    next(error);
  }
}