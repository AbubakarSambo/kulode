import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ExpensesService } from './expenses.service';
import {
  CreateExpenseDto,
  UpdateExpenseDto,
  ExpenseFilterDto,
  CreateExpenseCategoryDto,
} from './dto';
import { CurrentUser, CurrentUserData, Roles, Role } from '../../common';

@ApiTags('Expenses')
@ApiBearerAuth()
@Controller()
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  // Expense endpoints
  @Get('expenses')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'List all expenses' })
  @ApiResponse({ status: 200, description: 'List of expenses' })
  async findAll(
    @CurrentUser('organizationId') organizationId: string,
    @Query() filter: ExpenseFilterDto,
  ) {
    return this.expensesService.findAll(organizationId, filter);
  }

  @Get('expenses/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Get expense by ID' })
  @ApiResponse({ status: 200, description: 'Expense details' })
  @ApiResponse({ status: 404, description: 'Expense not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.expensesService.findOne(id, organizationId);
  }

  @Post('expenses')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Create a new expense' })
  @ApiResponse({ status: 201, description: 'Expense created' })
  async create(
    @Body() dto: CreateExpenseDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.expensesService.create(user.organizationId, user.id, dto);
  }

  @Patch('expenses/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Update expense' })
  @ApiResponse({ status: 200, description: 'Expense updated' })
  @ApiResponse({ status: 404, description: 'Expense not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.expensesService.update(id, organizationId, dto);
  }

  @Delete('expenses/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Delete expense' })
  @ApiResponse({ status: 200, description: 'Expense deleted' })
  @ApiResponse({ status: 404, description: 'Expense not found' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.expensesService.remove(id, organizationId);
  }

  // Category endpoints
  @Get('expense-categories')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'List expense categories' })
  @ApiResponse({ status: 200, description: 'List of categories' })
  async findAllCategories(@CurrentUser('organizationId') organizationId: string) {
    return this.expensesService.findAllCategories(organizationId);
  }

  @Post('expense-categories')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Create expense category' })
  @ApiResponse({ status: 201, description: 'Category created' })
  @ApiResponse({ status: 409, description: 'Category already exists' })
  async createCategory(
    @Body() dto: CreateExpenseCategoryDto,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.expensesService.createCategory(organizationId, dto);
  }

  @Patch('expense-categories/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Update expense category' })
  @ApiResponse({ status: 200, description: 'Category updated' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateExpenseCategoryDto,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.expensesService.updateCategory(id, organizationId, dto);
  }

  @Delete('expense-categories/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Deactivate expense category' })
  @ApiResponse({ status: 200, description: 'Category deactivated' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async removeCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.expensesService.removeCategory(id, organizationId);
  }
}
