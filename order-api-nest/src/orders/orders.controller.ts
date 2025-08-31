import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from "@nestjs/common";
import { CreateOrderDto } from "./dto/create-order.dto.js";
import { OrdersService } from "./orders.service.js";

@Controller("orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  list(@Query("paid") paid?: string) {
    return this.ordersService.list(paid === undefined ? undefined : paid === "true");
  }

  @Get("totals")
  totals() {
    return this.ordersService.totals();
  }

  @Get(":id")
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.ordersService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }
}
